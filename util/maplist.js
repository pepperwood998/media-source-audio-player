class Chunk {
    constructor(data, start, end) {
        this.next = null; // Chunk
        this.prev = null; // Chunk
        this.byteStart = start;
        this.byteEnd = end;
        this.data = data; // ArrayBuffer
    }
}

class MapList {
    constructor(size = 0, offset = 0) {
        this.head = null;
        this.tail = null;
        this.size = size;
        this.offset = offset;

        this.onInsert = chunk => undefined;
    }

    insertBefore(target, data, start, end) {
        let chunk = new Chunk(data, start, end);
        chunk.next = target;

        let prev = target.prev;
        if (prev !== null) {
            prev.next = chunk;
            chunk.prev = prev;
        }
        target.prev = chunk;
    }

    insertAfter(target, data, start, end) {
        let chunk = new Chunk(data, start, end);
        chunk.prev = target;

        let next = target.next;
        if (next !== null) {
            next.prev = chunk;
            chunk.next = next;
        }

        target.next = chunk;
    }

    // insertLinear(data, start, end) {
    //     if (this.isEmpty()) {
    //         this.head = this.current = new Chunk(data, start, end);
    //         break;
    //     }
    // }

    insert(before, after, data, start, end) {
        let chunk = new Chunk(data, start, end);
        if (before === null && after === null) {
            this.head = this.tail = chunk;
        } else {
            if (before === null) {
                if (this.head === after) {
                    this.head = chunk;
                }
                chunk.next = after;
                after.prev = chunk;
            } else if (after === null) {
                if (this.tail === before) {
                    this.tail = chunk;
                }
                before.next = chunk;
                chunk.prev = before;
            } else {
                chunk.prev = before;
                chunk.next = after;
                before.next = chunk;
                after.prev = chunk;
            }
        }

        this.onInsert(chunk);
        return chunk;
    }

    seek(point) {
        return new Promise((resolve, reject) => {
            if (this.isEmpty()) {
                resolve({
                    before: null,
                    after: null
                });
            }

            if (this.tail.byteEnd === this.size - 1) {
                if (this.tail.byteStart <= point) reject(this.tail);
            }

            let temp = this.head;
            while (temp != null) {
                // ? - p - o
                if (point < temp.byteStart) {
                    resolve({
                        before: temp.prev,
                        after: temp
                    });
                }

                // o(p)
                if (temp.byteStart <= point && point <= temp.byteEnd) {
                    resolve({
                        before: temp,
                        after: temp.next
                    });
                }

                temp = temp.next;
            }

            resolve({
                before: this.tail,
                after: null
            });
        });
    }

    evaluateInsertion(before, after, point, maxSize) {
        return new Promise((resolve, reject) => {
            let start = 0;
            let end = 0;
            let init = null;

            if (before === null && after === null) {
                start = point;
                end = point + maxSize - 1;
            } else if (before === null) {
                // x - p - o
                start = Math.min(
                    point,
                    Math.max(this.offset, after.byteStart - maxSize)
                );

                if (after.byteStart - start > maxSize) {
                    end = start + maxSize - 1;
                } else {
                    end = start + (after.byteStart - start) - 1;
                }
            } else {
                // o - p - ?

                if (point <= before.byteEnd) {
                    //o(p) - ?
                    start = before.byteEnd + 1;
                    init = before;
                } else {
                    start = point;
                }

                if (after === null) {
                    // o - p - x
                    end = start + maxSize - 1;
                } else {
                    // before and after are continuous, no insertion
                    if (before.byteEnd + 1 === after.byteStart) {
                        reject(before);
                    }
                    // o - p - o
                    let size = Math.min(maxSize, after.byteStart - start);
                    end = start + size - 1;
                }
            }

            resolve({
                init,
                start,
                end
            });
        });
    }

    continueChunk(start, cb) {
        let temp = start.next;

        if (temp !== null) {
            if (temp.prev.byteEnd + 1 === temp.byteStart) {
                cb(temp);
            }
        }
    }

    isEmpty() {
        return this.head === null;
    }

    print() {
        let temp = this.head;
        let str = '';

        while (temp !== null) {
            str += `[${temp.byteStart},${temp.byteEnd}] `;
            temp = temp.next;
        }

        console.log(str);
    }
}
