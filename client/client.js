/* eslint-env browser */
/* global jQuery */
(function ($) {
  var c = $('#archiveListContainer')

  $.get('/api/transcripts')
    .done(function (data) {
      console.log('/api/transcripts', data)
      data.payload.forEach(function (d) {
        var tr = document.createElement('tr')
        tr.innerHTML = '<td>' + d + '</td>' +
          '<td><a class="btn btn-primary" role="button" href="/api/transcripts/' + d + '?download=1">Download</a></td>'
        c.append(tr)
      })
      if (!data.payload.length) {
        var tr = document.createElement('tr')
        tr.innerHTML = '<td colspan="2">No archives transcripted yet.</td>'
        c.append(tr)
      }
      $('#loading').hide()
    })
    .fail(function (err) {
      console.log('Error getting list of transcripts', err)
      alert('Error getting list of transcripts')
    })
})(jQuery)
