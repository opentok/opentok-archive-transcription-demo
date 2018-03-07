# OpenTok Archive Transcript demo

This sample application shows how you can transcribe archives recorded with OpenTok using Google Speech API. It integrates with AWS S3 and Google Speech API. It will work with any OpenTok application that is auto-configured to push to S3.

You can easily deploy this demo to Heroku using the deploy button below. Or, read on if you want to deploy it to anywhere else.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Workflow

1. Configure OpenTok project:
    1. auto-upload archives to AWS S3
    2. archive monitoring callback URL in OpenTok project set to `/ot_callback` of this application. For example, if this application is hosted at `https://foo.com`, then the URL will be `https://foo.com/ot_callback`.
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


[gapi-async]: https://cloud.google.com/speech/docs/async-recognize
