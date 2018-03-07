# OpenTok Archive Transcript demo

This sample application shows how you can transcribe archives recorded with OpenTok using Google Speech API. It integrates with AWS S3 and Google Speech API. It will work with any OpenTok application that is auto-configured to push to S3.

You can easily deploy this demo to Heroku using the deploy button below. Or, read on if you want to deploy it to anywhere else.

This application includes the server to transcribe the archives, a HTTP JSON API to fetch the transcripts and a web client to access the transcripts.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Workflow

1. Configure OpenTok project:
    1. auto-upload archives to AWS S3
    2. archive monitoring callback URL in OpenTok project set to `/ot_callback` of this application.
2. When a new archive is created:
    1. OpenTok uploads the archive file to S3
    2. OpenTok posts a callback to this application via the URL configured for archive monitoring
3. The application then starts processing the archive files based on archive's `outputMode`
    1. If archive mode is `composed`:
        - fetches the archive's `.mp4` file from S3 as a stream
        - extracts audio from MP4 to FLAC using FFmpeg.
        - uploads the audio as `.flac` to a bucket in Google Cloud storage.(This needs to be done because Google Speech API needs you to upload audio files larger than 1 minute to Google Cloud Storage instead of sending the audio data through the API)
        - performs [async speech recognition][gapi-async] using Google Speech API for that uploaded `.flac` file
        - parses transcription results from Google Speech API into a text file
        - uploads text file and transcription metadata back to the same bucket in AWS S3.
    2. If archive `outputMode` is `individual`, it does a few extra steps:
        - downloads the archive's `.zip` file from S3 and extracts its contents
        - parses the manifest JSON file OpenTok added in the zip
        - for each stream's `.webm` file in the zip it does these in sequence:
            - extracts audio from WebM to FLAC using FFmpeg.
            - uploads the audio as `.flac` to a bucket in Google Cloud storage.
            - performs async speech recognition using Google Speech API for that file.
            - parses transcription results from Google Speech API into a text file
            - uploads text file to the same bucket in S3, naming it using stream ID
        - when all `.webm` files have been processed, it uploads a grouped metadata file to S3.

## What you will need

Setting this application up needs a few things:

1. Get an [OpenTok account][signup].
2. Create a new "Standard Project" in your OpenTok account. Note the API key for that project.
3. Set up an AWS S3 bucket. Connect your OpenTok project to that S3 bucket using [these instructions][using-s3].
4. Set up a Google Cloud account and configure it:
    1. create a GCP console project and enable Google Speech API. See [the setup instructions here][gcp-quickstart]. Download the private key of the service account as JSON.
    2. Under the same project, create a new Google Cloud storage bucket. Note its ID.

When you deploy to Heroku, it will ask you for these information. Put them in the required fields and deploy.

**Post installation**: Once deployed, configure the OpenTok project's archive monitoring callback to point to `/ot_callback` of the deployed instance. For example, if your application URL is `https://foo.herokuapp.com/`, then the callback URL will be `https://foo.herokuapp.com/ot_callback`.

## Code walk-through

This is a NodeJS application. It uses AWS's NodeJS SDK for accessing S3 and Google Cloud's NodeJS SDK for accessing Google Speech API and Google Cloud Storage. It does not need access to the OpenTok's credentials because it depends on OpenTok to `POST` to the callback URL when an archive is ready to be processed.

The main logic triggers when OpenTok posts a callback with new archive information to `/ot_callback`. This code is present in [`server.js`][server.js]:

```js
app.post('/ot_callback', (req, res) => {
  if (req.body.status === 'uploaded') {
    archive.processArchive(req.body)
      .catch(err => {
        console.log(`Error processing new archive upload. Reason: ${err}`)
      })
  }
  res.status(200).send()
})
```

`archive.processArchive()` is called whenever Opentok says notifies that an archive has been uploaded to S3. Rest of the processing happens in [`archive.js`][archive.js] and [`transcribe.js`][transcribe.js].

Internally, `archive.processArchive()` switches based on whether the new archive is created in `composed` or `individual` output mode. It calls `archive.processIndividualOutput()` or `archive.processComposedOutput()` depending on the output mode. ([See here][archiving] for information on the two types of outputs for OpenTok archiving.)

In both cases, they call [`transcribe.transcribeAudio()`][transcribe.js]. This function handles the actual transcription process with Google Speech API.

The [server][server.js] also exposes a HTTP JSON API to fetch transcripts and their metadata stored in S3 and to list the APIs. Code for the minimal frontend is present in the [`client`][client] directory.

[gapi-async]: https://cloud.google.com/speech/docs/async-recognize
[signup]: https://tokbox.com/account/user/signup
[using-s3]: https://tokbox.com/developer/guides/archiving/using-s3.html
[gcp-quickstart]: https://cloud.google.com/speech/docs/quickstart
[server.js]: server.js
[archive.js]: archive.js
[transcribe.js]: transcribe.js
[archiving]: https://tokbox.com/developer/guides/archiving/#individual-stream-and-composed-archives
[client]: client/
