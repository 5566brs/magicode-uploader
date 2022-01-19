#!/usr/bin/env node

const { request } = require('https'), { stat, createReadStream } = require('fs'), { parse } = require('path');

function errhandle(message) {
    process.exitCode = 1;
    console.error(message);
}

function dbg(message) {
    if (process.argv.indexOf('-v') !== -1) {
        process.stderr.clearLine();
        process.stderr.cursorTo(0);
        process.stderr.write(message || '')
    }
}

if (process.argv.length < 3) {
    return errhandle(`usage:\n\tnode ${process.argv[1]} <filepath>\n\t-v  verbose mode`)
}

let filepath = process.argv[2] === '-v' ? process.argv[3] : process.argv[2]

stat(filepath, (err, fstat) => {
    if (err) {
        return errhandle(`Error: ${err.message.split(':')?.[1] || err.message}`)
    }
    if (fstat.size === 0) {
        return errhandle(`Error: no content in file ${filepath}`)
    }
    if (fstat.size > 1024 * 1024 * 1024 * 10) {
        return errhandle(`Eror: the file ${filepath} is bigger than 10GB`)
    }
    //stat.isDirectory();
    dbg(`filepath: ${filepath}\nsize:${fstat.size}\n`)
    prepUpload(fstat.size)
});

function prepUpload(size) {
    let postData = JSON.stringify({
        filename: parse(filepath).base,
        size: size
    }), data = new Uint8Array();

    request('https://send.magicode.me/send-file/prep-upload', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        }
    },
        (res) => {
            res.on('data', (d) => {
                data = Buffer.concat([data, d]);
            })
            res.on('end', () => {
                dbg('prep upload response: ' + data + '\n')
                if (!res.complete) {
                    return errhandle('The connection was terminated');
                }
                try {
                    var { keyUpload, keyFile } = JSON.parse(data)
                    console.log(`https://send.magicode.me/send-file/file/${keyFile}/view`)
                }
                catch (e) {
                    if (e) {
                        return errhandle(`Error: ${e.message}\nserver respond: ${data.toString()} `);
                    }
                }
                dataUpload(keyUpload, keyFile, size)
            })
            res.on('error', (d) => {
                return errhandle(`Error: ${e.message}`);
            })
        })
        .end(postData)
        .on('close', () => {
        })
        .on('error', e => {
            return errhandle(`Error: ${e.message}`);
        })
}

function dataUpload(kupload, kfile, size) {
    let position = 0, boundary = '----1234', CRLF = '\r\n',
        boundaryHeader = `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="blob"${CRLF}Content-Type: application/octet-stream${CRLF + CRLF}`,
        boundaryFooter = `${CRLF}--${boundary}--${CRLF}`, data = new Uint8Array();

    let req = request(`https://send.magicode.me/send-file/data-upload?position=${position}&length=${size}&keyUpload=${kupload}&keyFile=${kfile}`,
        {
            method: 'POST',
            headers: {
                'Connection': 'keep-alive',
                'Content-Type': 'multipart/form-data; boundary=' + boundary,
                'Content-Length': boundaryHeader.length + boundaryFooter.length + size
            }
        },
        (res) => {
            res.on('data', (d) => {
                data = Buffer.concat([data, d]);
            })
            res.on('end', () => {
                dbg('data upload response: ' + data + '\n')
                if (!res.complete) {
                    return errhandle('Error: The connection was terminated');
                }
                try {
                    var status = JSON.parse(data)
                } catch (e) {
                    if (e) {
                        return errhandle(`Error: ${e.message}\nserver respond: ${data.toString()} `);
                    }
                }
                if (status.ok === true && status.end === true) {
                    dbg('job done!\n')
                }
            })
        })
    req.write(boundaryHeader)
    let writer = createReadStream(filepath);
    writer.pipe(req, { end: false });
    writer.on('end', () => {
        req.end(boundaryFooter)
    });
    writer.on('error', e => {
        return errhandle(`Error: ${e.message}`)
    })
    req.on('error', e => {
        return errhandle(`Error: ${e.message}`)
    })
}