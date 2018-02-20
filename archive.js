const AWS = require('aws-sdk')
const ffmpeg = require('fluent-ffmpeg')
const transcribe = require('./transcribe')

class Archive {
  constructor (conf) {
    this.s3_bucket = conf.AWS_S3_BUCKET_NAME
    this.opentok_project_id = conf.OPENTOK_API_KEY
    this.s3 = new AWS.S3()
    this._conf = conf
  }

  getArchiveVideo (archiveId) {
    const params = {
      Bucket: this.s3_bucket,
      Key: `${this.opentok_project_id}/${archiveId}/archive.mp4`
    }
    return this.s3.getObject(params).createReadStream()
      .on('error', (e) => {
        console.log(`Error fetching archive. Reason: ${e}`)
      })
  }

  extractAudio (archiveId, vidStream) {
    return ffmpeg()
      .input(vidStream)
      .on('start', (cmdline) => {
        console.log(`Starting transcoding of archive ${archiveId}. Command: ${cmdline}`)
      })
      .on('error', (err) => {
        console.log(`Error transcoding of archive ${archiveId}. Reason: ${err}`)
      })
      .on('end', () => {
        console.log(`Completed transcoding of archive ${archiveId}`)
      })
      .noVideo()
      .format('flac')
      .audioChannels(1)
  }

  uploadTranscript (archiveId, txt) {
    const content = JSON.stringify({
      archiveId: archiveId,
      created_at: Date.now(),
      content: txt
    })
    const params = {
      Bucket: this.s3_bucket,
      Key: `${this.opentok_project_id}/${archiveId}/transcript.json`,
      Body: content,
      ContentType: 'application/json'
    }
    return new Promise((resolve, reject) => {
      this.s3.putObject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }

  /**
   * Process an archive
   *
   * @param {string} archiveId - OpenTok archive ID
   */
  async process (archiveId) {
    const vidStream = this.getArchiveVideo(archiveId)
    const uploadFileName = `${this.opentok_project_id}-${archiveId}.flac`
    const gFilename = `gs://${this._conf.GOOGLE_STORAGE_BUCKET}/${uploadFileName}`
    const wr = transcribe.store(this._conf.GOOGLE_STORAGE_BUCKET, uploadFileName)
    wr.on('finish', () => {
      transcribe.transcribeAudio(gFilename)
        .then(txt => {
          console.log(`Transcription for archive ${archiveId}:\n${txt}\n`)
          return this.uploadTranscript(archiveId, txt)
        })
        .then(() => {
          console.log(`Uploaded transcript file to S3 for archive ${archiveId}`)
        })
        .catch(err => {
          console.log(`Error uploading transcript file to S3. Archive: ${archiveId}. Reason: ${err}`)
        })
    })
    this.extractAudio(archiveId, vidStream).pipe(wr, { end: true })
  }
}

// export
module.exports = Archive
