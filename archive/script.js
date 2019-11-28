var audio = document.querySelector('audio');
var mediaSource;
var sourceBuffer;
var mime = 'audio/mpeg';

var chunkSize = 162 * 1024;
var totalLength = 0;
var rangeStart = 0;
var rangeEnd = 0;

var api = {
    info:
        'http://localhost:8080/stream/info/13b3dc0b-e6dc-4e4b-b591-78f0872f6101',
    stream: 'http://localhost:8080/stream/13b3dc0b-e6dc-4e4b-b591-78f0872f6101'
};

function play() {
    audio.play();
}

var temp = 5;
function init() {
    if (window.MediaSource) {
        mediaSource = new MediaSource();
        audio.src = URL.createObjectURL(mediaSource);

        mediaSource.addEventListener('sourceopen', onSourceOpen);
        audio.addEventListener('play', e => {});
        audio.addEventListener('pause', e => {});

        /// >>> THIS IS THE SILVER BULLET <<<
        audio.addEventListener('timeupdate', e => {
              if (audio.currentTime >= temp && rangeStart < totalLength) {
                console.log("a");
                temp += 5;
                fetchChunk(api.stream);
              }
        });

        audio.addEventListener('progress', e => {
            console.log(
                audio.buffered.start(sourceBuffer.buffered.length - 1),
                audio.buffered.end(sourceBuffer.buffered.length - 1)
            );
        });
        audio.addEventListener('seeked', e => {
            console.log('seeked');
        });
    } else {
        console.log('The Media Source Extension API is not supported');
    }
}

var stupid = [];
function onSourceOpen(e) {
    // garbage collection purpose
    URL.revokeObjectURL(audio.src);

    sourceBuffer = mediaSource.addSourceBuffer(mime);
    sourceBuffer.addEventListener('updateend', e => {
        if (stupid.length) sourceBuffer.appendBuffer(stupid.shift());
    });
    fetchInfo(api.info).then(() => {
        fetchChunk(api.stream);
    });
}

function fetchInfo(uri) {
    return fetch(uri)
        .then(response => {
            // totalLength = getNumericHeader(response.headers, 'content-length');
            return response.json();
        })
        .then(info => {
            totalLength = info.size;
            mediaSource.duration = info.duration;
        });
}

function fetchChunk(uri) {
    fetch(uri, {
        method: 'GET',
        headers: {
            Range: getRange()
        }
    })
        .then(response => {
            let length = getNumericHeader(response.headers, 'content-length');
            rangeStart += length;

            return response.arrayBuffer();
        })
        .then(data => {
            if (sourceBuffer.updating) {
                stupid.push(data);
            } else {
                sourceBuffer.appendBuffer(data);
            }
        })
        .catch(console.error);
}

function getRange() {
    rangeEnd = rangeStart + chunkSize;
    return 'bytes=' + rangeStart + '-' + rangeEnd;
}

function getNumericHeader(headers, key) {
    return parseInt(headers.get(key), 10);
}
