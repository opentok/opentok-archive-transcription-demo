const AWS = require('aws-sdk')
const ffmpeg = require('fluent-ffmpeg')
const transcribe = require('./transcribe')
const yauzl = require('yauzl')
const fs = require('fs')
const path = require('path')

class Archive {
  constructor (conf) {
    this.s3_bucket = conf.AWS_S3_BUCKET_NAME
    this.opentok_project_id = conf.OPENTOK_API_KEY
    this.s3 = new AWS.S3()
    this._conf = conf
    this._tmpdir = path.resolve('tmp')

    this._archiveListCache = []

    // Instantiate `tmp` dir
    if (!fs.existsSync(this._tmpdir)) {
      fs.mkdirSync(this._tmpdir)
    }
  }

  downloadArchiveFromS3 (archiveId, individualOutput = false) {
    const params = {
      Bucket: this.s3_bucket,
      Key: `${this.opentok_project_id}/${archiveId}/archive.${individualOutput ? 'zip' : 'mp4'}`
    }
    return this.s3.getObject(params).createReadStream()
      .on('error', (e) => {
        console.log(`Error fetching archive. Reason: ${e}`)
      })
  }

  s3TranscriptMetadataPath (archiveId) {
    return `${this.opentok_project_id}/transcripts-metadata/${archiveId}.json`
  }

  s3TranscriptPath (archiveId, streamId = 'transcript') {
    return `${this.opentok_project_id}/transcripts/${archiveId}/${streamId}.txt`
  }

  getTranscriptMetadata (archiveId) {
    const params = {
      Bucket: this.s3_bucket,
      Key: this.s3TranscriptMetadataPath(archiveId)
    }
    return new Promise((resolve, reject) => {
      this.s3.getObject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(JSON.parse(data.Body.toString('utf-8')))
      })
    })
  }

  getTranscript (archiveId, streamId = 'transcript') {
    const params = {
      Bucket: this.s3_bucket,
      Key: this.s3TranscriptPath(archiveId, streamId)
    }
    return new Promise((resolve, reject) => {
      this.s3.getObject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data.Body.toString('utf-8'))
      })
    })
  }

  listAvailableTranscripts () {
    return new Promise((resolve, reject) => {
      if (this._archiveListCache.length) {
        resolve(this._archiveListCache)
        return
      }
      const params = {
        Bucket: this.s3_bucket,
        Prefix: `${this.opentok_project_id}/transcripts-metadata/`
      }
      this.s3.listObjectsV2(params, (err, data) => {
        if (err) {
          reject(err)
        }
        if (!data.KeyCount) {
          resolve([])
        }
        const archives = data.Contents.map(c => c.Key.split('/')[2].split('.')[0])
        const archiveMetadataList = []
        const ok = () => {
          this._archiveListCache = archiveMetadataList.sort((a, b) => {
            return b.createdAt - a.createdAt
          })
          resolve(this._archiveListCache)
        }
        let counter = 0
        for (const a of archives) {
          this.getTranscriptMetadata(a)
            .then(data => {
              archiveMetadataList.push(data)
              counter++
              if (counter === archives.length) {
                ok(archiveMetadataList)
              }
            })
            .catch(err => {
              console.log(`Error fetching transcript metadata. Reason: ${err}`)
              counter++
              if (counter === archives.length) {
                ok(archiveMetadataList)
              }
            })
        }
      })
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

  uploadTranscript (txt, archiveId, streamId = 'transcript') {
    const params = {
      Bucket: this.s3_bucket,
      Key: this.s3TranscriptPath(archiveId, streamId),
      Body: txt,
      ContentType: 'text/plain'
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

  uploadTranscriptMetadata (metadata, streamsTranscribed = [], manifest = null) {
    const archiveId = metadata.id
    const content = {
      archiveId: archiveId,
      outputMode: metadata.outputMode,
      projectId: metadata.projectId,
      createdAt: metadata.createdAt,
      duration: metadata.duration,
      sessionId: metadata.sessionId,
      transcripts: []
    }
    if (metadata.outputMode === 'composed') {
      content.transcripts.push({
        transcript: 'transcript.txt',
        transcriptKey: this.s3TranscriptPath(archiveId)
      })
    } else {
      content.transcripts = streamsTranscribed.map(s => {
        return {
          transcript: `${s}.txt`,
          transcriptKey: this.s3TranscriptPath(archiveId, s)
        }
      })
      content.manifest = manifest
    }
    const params = {
      Bucket: this.s3_bucket,
      Key: this.s3TranscriptMetadataPath(archiveId),
      Body: JSON.stringify(content, null, 2),
      ContentType: 'application/json'
    }
    return new Promise((resolve, reject) => {
      this.s3.putObject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        this._archiveListCache.unshift(content)
        resolve(data)
      })
    })
  }

  /**
   * Process an archive
   *
   * @param {object} metadata - JSON data posted by OpenTok archive monitoring callback
   */
  async processArchive (metadata) {
    if (metadata.outputMode === 'composed') {
      this.processComposedOutput(metadata)
    } else if (metadata.outputMode === 'individual') {
      this.processIndividualOutput(metadata)
    } else {
      console.log('Skipping processing of unknown output mode', metadata)
    }
  }

  /**
   * Process an archive recorded in individual output mode
   *
   * @param {object} metadata - JSON data posted by OpenTok archive monitoring callback
   */
  async processIndividualOutput (metadata) {
    const archiveId = metadata.id
    const zipStream = this.downloadArchiveFromS3(archiveId, true)
    const zipPath = path.join(this._tmpdir, `${archiveId}.zip`)
    const archiveOutput = fs.createWriteStream(zipPath)
    let streamsTranscribed = []
    let manifest = {}

    archiveOutput.on('finish', () => {
      console.log('Saved archive.zip temporarily to', zipPath)
      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipFile) => {
        if (err) {
          console.log(`Error opening zip file. Reason: ${err}`)
          return
        }
        zipFile.readEntry()
        zipFile.on('entry', entry => {
          if (entry.fileName === `${archiveId}.json`) {
            console.log('Parsing manifest file for archive')
            zipFile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.log(`Error opening manifest file. Reason: ${err}`)
                return
              }
              const chunks = []
              readStream.on('data', d => {
                chunks.push(d)
              }).on('end', () => {
                manifest = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
                zipFile.readEntry()
              }).read()
            })
          } else if (/\.webm$/.test(entry.fileName)) {
            console.log(`Processing stream file ${entry.fileName}`)
            zipFile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.log(`Error opening webm file. Reason: ${err}`)
                return
              }
              const streamId = entry.fileName.split('.')[0]
              const uploadFileName = `${this.opentok_project_id}/${archiveId}/${streamId}.flac`
              const gFilename = `gs://${this._conf.GOOGLE_STORAGE_BUCKET}/${uploadFileName}`
              const wr = transcribe.store(this._conf.GOOGLE_STORAGE_BUCKET, uploadFileName)
              wr.on('finish', () => {
                console.log(`Uploaded to ${gFilename}`)
                transcribe.transcribeAudio(gFilename)
                  .then(txt => {
                    console.log(`Transcription for ${entry.fileName}:\n${txt}\n`)
                    return this.uploadTranscript(txt, archiveId, streamId)
                  })
                  .then(() => {
                    streamsTranscribed.push(streamId)
                    console.log(`Uploaded transcript file to S3 for archive ${archiveId}`)
                    zipFile.readEntry()
                  })
                  .catch(err => {
                    console.log(`Error uploading transcript file to S3. Archive: ${archiveId}. Reason: ${err}`)
                    zipFile.readEntry()
                  })
              })
              this.extractAudio(archiveId, readStream).pipe(wr, { end: true })
            })
          } else {
            zipFile.readEntry()
          }
        })
        zipFile.on('close', () => {
          console.log('Finished processing archive', archiveId)
          this.uploadTranscriptMetadata(metadata, streamsTranscribed, manifest)
        })
      })
    })
    zipStream.pipe(archiveOutput)
  }

  /**
   * Process an archive recorded in composed mode
   *
   * @param {object} metadata -
   */
  async processComposedOutput (metadata) {
    const archiveId = metadata.id
    const vidStream = this.downloadArchiveFromS3(archiveId, false)
    const uploadFileName = `${this.opentok_project_id}/${archiveId}/archive.flac`
    const gFilename = `gs://${this._conf.GOOGLE_STORAGE_BUCKET}/${uploadFileName}`
    const wr = transcribe.store(this._conf.GOOGLE_STORAGE_BUCKET, uploadFileName)
    wr.on('finish', () => {
      transcribe.transcribeAudio(gFilename)
        .then(txt => {
          console.log(`Transcription for archive ${archiveId}:\n${txt}\n`)
          return this.uploadTranscript(txt, archiveId)
        })
        .then(() => {
          return this.uploadTranscriptMetadata(metadata)
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
