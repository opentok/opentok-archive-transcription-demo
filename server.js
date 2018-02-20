/**
 * Main server script
 */

const express = require('express')
const bodyParser = require('body-parser')
const Archive = require('./archive')

// --- Parse configurations from environment variables ---
const CONFIG = {}

// Array of arrays specifying required environment vars. Item 0 is name of env var. Item 1 is optional default value.
const reqEnvVars = [
  [ 'PORT', 8080 ],
  [ 'OPENTOK_API_KEY' ],
  [ 'OPENTOK_API_SECRET' ],
  [ 'AWS_S3_BUCKET_NAME' ],
  [ 'AWS_ACCESS_KEY_ID' ],
  [ 'AWS_SECRET_ACCESS_KEY' ],
  [ 'GOOGLE_STORAGE_BUCKET' ],
  [ 'GOOGLE_APPLICATION_CREDENTIALS', 'service-account-file.json' ]
]

// Validate configs are present and set defaults
for (const ev of reqEnvVars) {
  if (!ev[1] && !process.env[ev[0]]) {
    console.log(`Need environment variable ${ev[0]}`)
    process.exit(1)
  }
  CONFIG[ev[0]] = process.env[ev[0]] || ev[1]
}

console.log(`Loading configuration:\n${JSON.stringify(CONFIG, null, 2)}\n`)

// --- Create Archive instance ---
const archive = new Archive(CONFIG)

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
  console.log(`Archive id ${req.body.id} ${req.body.status}`)
  if (req.body.status === 'uploaded') {
    archive.process(req.body.id)
      .catch(err => {
        console.log(`Error processing new archive upload. Reason: ${err}`)
      })
  }
  res.status(200).send()
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
