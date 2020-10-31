/**
 * Main server script
 */

const express = require('express')
const bodyParser = require('body-parser')
const Archive = require('./archive')
const OpenTok = require('opentok')

// --- Parse configurations from environment variables ---
const CONFIG = {}

// Array of arrays specifying required environment vars. Item 0 is name of env var. Item 1 is optional default value.
const reqEnvVars = [
  ['PORT', 8080],
  ['OPENTOK_API_KEY'],
  ['OPENTOK_API_SECRET'],
  ['AWS_S3_BUCKET_NAME'],
  ['AWS_ACCESS_KEY_ID'],
  ['AWS_SECRET_ACCESS_KEY'],
  ['GOOGLE_STORAGE_BUCKET'],
  ['GOOGLE_APPLICATION_CREDENTIALS', 'service-account-file.json'],
  ['GOOGLE_APPLICATION_CREDENTIALS_JSON', 0]
]

// Validate configs are present and set defaults
for (const ev of reqEnvVars) {
  if (ev[1] == null && !process.env[ev[0]]) {
    console.log(`Need environment variable ${ev[0]}`)
    process.exit(1)
  }
  CONFIG[ev[0]] = process.env[ev[0]] || ev[1]
}

// --- Create OpenTok instance ---
const opentok = new OpenTok(CONFIG.OPENTOK_API_KEY, CONFIG.OPENTOK_API_SECRET)

// --- Create Archive instance ---
const archive = new Archive(CONFIG, opentok)

// --- Bootstrap Express Application ---

// Create expressJS app instance
const app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Mount the `./client` dir to web-root as static.
app.use('/', express.static('./client'))

// --- REST endpoints ---

/**
 * Callback handler for OpenTok archive monitoring
 */
app.post('/ot_callback', (req, res) => {
  if (req.body.id) {
    console.log(`Archive id ${req.body.id} ${req.body.status} (mode: ${req.body.outputMode})`)
  }
  if (req.body.status === 'uploaded') {
    archive.processArchive(req.body)
      .catch(err => {
        console.log(`Error processing new archive upload. Reason: ${err}`)
      })
  }
  res.status(200).send()
})

app.get('/api/transcripts', (req, res, next) => {
  archive.listAvailableTranscripts()
    .then(data => {
      res.status(200).json({
        message: 'Available Transcripts',
        payload: data
      })
    })
    .catch(err => {
      next(err)
    })
})

/**
 * Get transcript metadata for given archive from S3
 */
app.get('/api/metadata/:archiveId', (req, res, next) => {
  archive.getTranscriptMetadata(req.params.archiveId)
    .then(data => {
      res.status(200).json({
        message: 'Transcript Metadata',
        payload: data
      })
    })
    .catch(err => {
      err.status = err.statusCode
      next(err)
    })
})

/**
 * Get the actual text of transcription for a given archive and its stream ID.
 */
app.get('/api/transcript/:archiveId/:streamId.txt', (req, res, next) => {
  const streamId = req.params.streamId || 'transcript'
  const archiveId = req.params.archiveId
  archive.getTranscript(archiveId, streamId)
    .then(data => {
      res.type('text/plain')
      res.status(200).send(data)
    })
    .catch(err => {
      err.status = err.statusCode
      next(err)
    })
})

/**
 * Delete archive by archive ID
 */
app.delete('/api/archives/:id', (req, res, next) => {
  opentok.deleteArchive(req.params.id, function (err) {
    if (err) {
      console.log(`Error deleting archive ${req.params.id}. Reason: ${err}`)
      next(err)
      return
    }
    console.log(`Deleted archive ${req.params.id}`)
    res.status(200).json({
      message: 'Archive deleted',
      payload: {
        id: req.params.id
      }
    })
  })
})

// Handle 404
app.use(function (req, res, next) {
  const err = new Error('Not found')
  err.status = 404
  next(err)
})

// error handler
app.use(function (err, req, res, next) {
  err.status = err.status || 500
  if (err.status === 500) {
    console.log('Error', err)
  }
  res.status(err.status).json({
    message: err.message || 'Unable to perform request',
    status: err.status
  })
})

// Bootstrap and start HTTP server for app
app.listen(CONFIG.PORT, () => {
  console.log(`Server started on port ${CONFIG.PORT}`)
})
