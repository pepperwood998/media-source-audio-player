class AudioStream {
    constructor(mime = 'audio/mpeg') {
        this.audio = new Audio();
        this.media = new MediaSource();
        this.buffer;

        this.uuid = '860cd172-daa6-4b05-9465-838554bc9dab';
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

        // create a map and list type data structure to hold the chunks
        this.totalSize = 0;
        this.offset = 0;
        this.dataSize = 0;
        this.chunkSize = 16000 * 10;

        this.data = new MapList();
        this.indicator;
        this.reqInfo = {
            status: false,
            start: 0,
            end: 0,
            threshold: 0
        };
        this.fromClean = false;
        this.seekedUpdate = false;

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
                if (this.indicator.byteEnd >= this.totalSize - 1) {
                    this.reqInfo.status = false;
                    return;
                }
                if (this.fromClean) {
                    this.fromClean = false;
                    this.buffer.appendBuffer(this.indicator.data);
                    return;
                }

                this.data
                    .continueChunk(this.indicator, this.chunkSize)
                    .then(newIndicator => {
                        this.indicator = newIndicator;
                        this.buffer.appendBuffer(newIndicator.data);
                    })
                    .catch(reqInfo => {
                        this.reqInfo.start = reqInfo.start;
                        this.reqInfo.end = reqInfo.end;
                        // !!! fcking hard-coded !!!!
                        this.reqInfo.threshold =
                            this.buffer.buffered.end(
                                this.buffer.buffered.length - 1
                            ) - 5;
                        this.reqInfo.status = true;
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

            if (
                !this.seekedUpdate &&
                this.reqInfo.status &&
                this.audio.currentTime >= this.reqInfo.threshold
            ) {
                this.reqInfo.status = false;
                this.fetchChunkThis(this.reqInfo.start, this.reqInfo.end).then(
                    chunk => {
                        let newIndicator = this.data.insert(
                            this.indicator,
                            this.indicator.next,
                            chunk.data,
                            chunk.start,
                            chunk.end
                        );

                        this.indicator = newIndicator;
                        this.buffer.appendBuffer(newIndicator.data);
                    }
                );
            } else {
                this.seekedUpdate = false;
            }
        });

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
            .seek(reqPoint, this.chunkSize)
            .then(seeker => {
                this.fetchChunkThis(seeker.start, seeker.end).then(chunk => {
                    let newChunk = this.data.insert(
                        seeker.before,
                        seeker.after,
                        chunk.data,
                        chunk.start,
                        chunk.end
                    );

                    // init != null, chunk is after init
                    this.beginStreamSequences(
                        seeker.init,
                        newChunk,
                        offsetTime
                    );
                });
            })
            .catch(init => {
                // buffers ready to be appended, no insertion occurs
                this.beginStreamSequences(init, null, offsetTime);
            });
    }

    // !!!!!
    // control the ending
    // !!!!!
    //
    beginStreamSequences(init, newChunk, offsetTime) {
        let canClean = false;
        let ranges = this.buffer.buffered;
        if (ranges.length) {
            if (offsetTime < ranges.start(0) || offsetTime > ranges.end(0)) {
                canClean = true;
            }
        }

        this.seekedUpdate = true;
        this.audio.currentTime = offsetTime;
        let timestampOffset = 0;

        if (init !== null || newChunk === null) {
            // click in buffered
            timestampOffset =
                ((init.byteStart - this.offset) / this.dataSize) *
                this.media.duration;
            if (newChunk !== null) {
                // new chunk inserted
                if (canClean) {
                    console.log('buffered:', 'newchunk:', 'cleanup');
                    this.indicator = init;
                    this.clean(timestampOffset);
                } else {
                    console.log('buffered:', 'newchunk:', 'continue');
                    this.indicator = newChunk;
                    this.buffer.appendBuffer(newChunk.data);
                }
            } else {
                // no insertion
                if (canClean) {
                    console.log('buffered:', 'nonew:', 'cleanup');
                    this.indicator = init;
                    this.clean(timestampOffset);
                } else {
                    console.log('buffered:', 'nonew:', 'continue');
                }
            }
        } else {
            // click in empty
            timestampOffset =
                ((newChunk.byteStart - this.offset) / this.dataSize) *
                this.media.duration;
            this.indicator = newChunk;
            if (this.buffer.buffered.length) {
                console.log('unbuffered:', 'cleanup');
                this.clean(timestampOffset);
            } else {
                console.log('unbuffered:', 'initial');
                this.buffer.timestampOffset = timestampOffset;
                this.buffer.appendBuffer(newChunk.data);
            }
        }
    }

    clean(newOffset) {
        this.buffer.abort();
        this.fromClean = true;
        this.buffer.timestampOffset = newOffset;
        this.buffer.remove(
            this.buffer.buffered.start(0),
            this.buffer.buffered.end(0)
        );
    }

    fetchInfo(uri) {
        return fetch(uri)
            .then(response => response.json())
            .then(info => {
                this.totalSize = info.size;
                this.offset = info.offset;
                this.dataSize = info.size - info.offset;
                this.chunkSize = (info.bitrate / 8) * 10;

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
            let mod = '0' + (second % 60);
            res = ':' + mod.slice(-2) + res;

            second = Math.floor(second / 60);
            if (second === 0) {
                res = res.substr(1);
                break;
            }
        }

        return res;
    }
}
