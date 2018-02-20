const speech = require('@google-cloud/speech')
const storage = require('@google-cloud/storage')()
const gclient = new speech.SpeechClient()

function store (bucketId, filename) {
  const gbucket = storage.bucket(bucketId)
  return gbucket.file(filename).createWriteStream()
    .on('error', err => {
      console.log(`Error uploading extracted audio to Google cloud storage. Reason: ${err}. File: ${filename}`)
    })
    .on('finish', () => {
      console.log(`Finished uploading extracted audio to Google cloud storage. File: ${filename}`)
    })
}

/**
 * Send audio to transcription service Google Cloud Speech API
 */
function transcribeAudio (googFilename) {
  return gclient.longRunningRecognize({
    config: {
      encoding: 'FLAC',
      languageCode: 'en-US'
    },
    audio: { uri: googFilename }
  })
    .then(data => {
      const res = data[0]
      return res.promise()
    })
    .then(data => {
      const res = data[0]
      const transcript = res.results.map(r => r.alternatives[0].transcript.trim()).join('\n')
      return transcript
    })
    .catch(err => {
      console.log(`Error transcribing audio. Reason: ${err}`)
    })
}

// export
module.exports = {
  transcribeAudio,
  store
}
