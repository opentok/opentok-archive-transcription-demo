/* eslint-env browser */
/* global jQuery */
(function ($) {
  var c = $('#archiveListContainer')

  $.get('/api/transcripts')
    .done(function (data) {
      console.log('/api/transcripts', data)
      data.payload.forEach(function (d) {
        var tr = document.createElement('tr')
        var createdAt = new Date(d.createdAt)
        var minutes = Math.floor(d.duration / 60)
        var seconds = d.duration - minutes * 60
        tr.innerHTML = '<td>' + d.archiveId + '</td>' +
          '<td>' + d.outputMode + '</td>' +
          '<td>' + (d.name || 'N/A') + '</td>' +
          '<td>' + createdAt.toLocaleString() + '</td>' +
          '<td>' + minutes + 'm ' + seconds + 's' + '</td>'
        if (d.outputMode === 'composed') {
          tr.innerHTML += '<td><a class="btn btn-primary" role="button" href="/api/transcript/' +
            d.archiveId + '/transcript.txt">Download</a></td>'
        } else {
          var downloadlist = '<td><div class="btn-group-vertical">'
          for (var t in d.transcripts) {
            downloadlist += '<a class="btn btn-primary" role="button" href="/api/transcript/' +
              d.archiveId + '/' + d.transcripts[t].transcript + '">Stream ' + (parseInt(t) + 1) + '</a>'
          }
          downloadlist += '</div></td>'
          tr.innerHTML += downloadlist
        }
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
