class AudioStream {
    constructor(mime = 'audio/mpeg') {
        this.audio = new Audio();
        this.media = new MediaSource();
        this.buffer;

        this.uuid = '13b3dc0b-e6dc-4e4b-b591-78f0872f6101';
        this.mime = mime;
        this.api = {
            root: 'http://localhost:8080',
            info: '/stream/info',
            stream: '/stream',
            getApi: function(key) {
                return this.root + '/' + this[key];
            },
            getInfoOf: function(uuid) {
                return this.getApi('info') + '/' + uuid;
            },
            getStreamOf: function(uuid) {
                return this.getApi('stream') + '/' + uuid;
            }
        };

        this.totalSize = 0;
        this.chunkPoint = 0;
        this.chunkSize = 162 * 1024;

        this.onBuffer = per => undefined;
        this.onProgress = per => undefined;
        this.onTrack = duration => undefined;
    }

    // this class event will in assignment form
    test() {
        this.audio.src = URL.createObjectURL(this.media);

        this.media.addEventListener('sourceopen', e => {
            URL.revokeObjectURL(this.audio.src);

            this.buffer = this.media.addSourceBuffer(this.mime);
            this.fetchInfo(this.api.getInfoOf(this.uuid)).then(() => {
                this.fetchChunk(this.api.getStreamOf(this.uuid), 0);
            });
        });

        this.audio.addEventListener('timeupdate', e => {
            console.log('time-update', this.audio.currentTime);
            var progressPer =
                (this.audio.currentTime / this.media.duration) * 100;
            this.onProgress(progressPer);
        });
        this.audio.addEventListener('progress', e => {
            console.log('buffer-progress');
            var bufferPer =
                (this.audio.buffered.end(this.audio.buffered.length - 1) /
                    this.media.duration) *
                100;
            this.onBuffer(bufferPer);
        });
    }

    play() {
        if (this.audio.paused) this.audio.play();
        else this.audio.pause();
    }

    seek(per) {
        this.audio.currentTime = this.media.duration * (per / 100);
        console.log(this.audio.currentTime, this.audio.buffered);
    }

    fetchInfo(uri) {
        return fetch(uri)
            .then(response => response.json())
            .then(info => {
                this.totalSize = info.size;
                this.media.duration = info.duration;

                this.onTrack(this.getFormattedTime(info.duration));
            });
    }

    fetchChunk(uri, start) {
        fetch(uri, {
            headers: {
                Range: this.getRangeStr(start, this.chunkSize)
            }
        })
            .then(response => {
                let length = this.getNumericHeader(
                    response.headers,
                    'content-length'
                );

                return response.arrayBuffer();
            })
            .then(data => {
                this.buffer.appendBuffer(data);
            })
            .catch(console.error);
    }

    getRangeStr(point, size) {
        return 'bytes=' + point + '-' + (point + size - 1);
    }

    getNumericHeader(headers, key) {
        return parseInt(headers.get(key), 10);
    }

    getFormattedTime(second) {
        let res = '';
        while (true) {
            let mod = second % 60;
            res = ':' + mod + res;

            second = Math.floor(second / 60);
            if (second === 0) {
                res = res.substr(1);
                break;
            }
        }

        return res;
    }
}
