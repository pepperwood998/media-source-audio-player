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

        this.chunkPoint = 0;
        this.chunkSize = 162 * 1024;

        // create a map and list type data structure to hold the chunks
        this.totalSize = 0;
        this.offset = 0;
        this.dataSize = 0;

        this.data = new MapList();
        this.indicator;
        this.temp = 0;

        this.onBuffer = per => undefined;
        this.onProgress = per => undefined;
        this.onTrackFormatted = duration => undefined;
    }

    // this class event will in assignment form
    test() {
        this.audio.src = URL.createObjectURL(this.media);

        this.media.addEventListener('sourceopen', e => {
            URL.revokeObjectURL(this.audio.src);
            this.buffer = this.media.addSourceBuffer(this.mime);
            this.buffer.addEventListener('updateend', e => {
                this.data.continueChunk(this.indicator, newIndicator => {
                    this.indicator = newIndicator;
                    this.buffer.appendBuffer(newIndicator.data);
                });
            });

            this.fetchInfo(this.api.getInfoOf(this.uuid)).then(() => {
                // this.fetchChunk(
                //     this.api.getStreamOf(this.uuid),
                //     0 + this.offset
                // );
            });
        });

        this.audio.addEventListener('timeupdate', e => {
            var progressPer =
                (this.audio.currentTime / this.media.duration) * 100;
            this.onProgress(progressPer);
        });
        // this.audio.addEventListener('progress', e => {
        //     var bufferPer =
        //         ((this.buffer.buffered.end(this.buffer.buffered.length - 1) -
        //             this.buffer.buffered.start(
        //                 this.buffer.buffered.length - 1
        //             )) /
        //             this.media.duration) *
        //         100;
        //     var offsetPer =
        //         (this.buffer.buffered.start(this.buffer.buffered.length - 1) /
        //             this.media.duration) *
        //         100;
        //     this.onBuffer(offsetPer, bufferPer);
        // });

        this.data.onInsert = chunk => {
            let bufferPer =
                ((chunk.byteEnd - chunk.byteStart + 1) / this.dataSize) * 100;
            let offsetPer =
                ((chunk.byteStart - this.offset) / this.dataSize) * 100;
            this.onBuffer(offsetPer, bufferPer);
        };
    }

    play() {
        if (this.audio.paused) this.audio.play();
        else this.audio.pause();
    }

    seek(per) {
        // problem:
        // should implement some queueing solution
        // prevent seeking before track info coming in
        //
        let reqPoint = Math.round(this.dataSize * (per / 100)) + this.offset;
        let offsetTime = this.media.duration * (per / 100);

        this.data
            .seek(reqPoint)
            .then(border => {
                this.data
                    .evaluateInsertion(
                        border.before,
                        border.after,
                        reqPoint,
                        this.chunkSize
                    )
                    .then(range => {
                        this.fetchChunkThis(range.start, range.end).then(
                            chunk => {
                                let init = this.data.insert(
                                    border.before,
                                    border.after,
                                    chunk.data,
                                    chunk.start,
                                    chunk.end
                                );
                                if (range.init && range.init !== null) {
                                    init = range.init;
                                }

                                this.beginStreamSequences(init, offsetTime);
                            }
                        );
                    })
                    .catch(init => {
                        console.log('reject');
                        this.beginStreamSequences(init, offsetTime);
                    });
            })
            .catch(init => {
                console.log('ending chunk');
                this.beginStreamSequences(init, offsetTime);
            });
    }

    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // figure out how to continue the stream automatically
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    //
    beginStreamSequences(init, offsetTime) {
        this.buffer.abort();
        let pointTime =
            ((init.byteStart - this.offset) / this.dataSize) *
            this.media.duration;
        this.buffer.timestampOffset = pointTime;
        this.audio.currentTime = Math.max(pointTime, offsetTime);

        this.indicator = init;
        this.buffer.appendBuffer(init.data);
    }

    fetchInfo(uri) {
        return fetch(uri)
            .then(response => response.json())
            .then(info => {
                this.totalSize = info.size;
                this.offset = info.offset;
                this.dataSize = info.size - info.offset;
                this.media.duration = info.duration;

                this.data.size = this.totalSize;
                this.data.offset = this.offset;

                this.onTrackFormatted(this.getFormattedTime(info.duration));
            });
    }

    fetchChunkThis(start, end) {
        return this.fetchChunk(this.api.getStreamOf(this.uuid), start, end);
    }

    fetchChunk(uri, start, end) {
        return fetch(uri, {
            headers: {
                Range: this.getRangeStr(start, end)
            }
        })
            .then(response => {
                return response.arrayBuffer();
            })
            .then(data => {
                return {
                    data,
                    start,
                    end: start + data.byteLength - 1
                };
            })
            .catch(console.error);
    }

    getRangeStr(start, end) {
        return 'bytes=' + start + '-' + end;
    }

    getNumericHeader(response, key) {
        return parseInt(response.headers.get(key), 10);
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
