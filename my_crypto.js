var Nacl = require("./nacl.js");
// Wrappers around Nacl. All take regular strings and return hex strings.
this.hash = function(string) {
    if (typeof string === 'string') {
        return Nacl.to_hex(Nacl.crypto_hash_string(string));
    } else {
        return Nacl.to_hex(Nacl.crypto_hash(string));
    }
};
this.hexSig = function(string, priv) {
    var signedMessage = Nacl.crypto_sign(Nacl.encode_utf8(string), priv);
    // Nacl puts 32 bytes of signature before the message and 32 bytes after.
    var signature = Nacl.to_hex(signedMessage.subarray(0,32)) +
        Nacl.to_hex(signedMessage.subarray(signedMessage.length - 32));
    return signature;
};
this.verify = function(string, hexSig, pub) {
    var sigBytes = new Buffer(hexSig, 'hex');
    var blobBuf = new Buffer(string, 'utf8');
    var pubBuf =  new Buffer(pub, 'hex');
    var signedMessage = new Buffer(blobBuf.length + 64);
    var off = 0;
    off = sigBytes.copy(signedMessage, 0, 0, 32);
    off += blobBuf.copy(signedMessage, off);
    off += sigBytes.copy(signedMessage, off, 32);

    var verified = Nacl.crypto_sign_open(signedMessage, pubBuf);
    return (verified !== null);
};
this.random_bytes = function(num) {
    return Nacl.random_bytes(num);
}
// TODO: this should be a protobuffer maybe?
this.serialize = function(obj) {
    return JSON.stringify(obj);
}
this.deserialize = function(blob) {
    return JSON.parse(blob);
}
this;