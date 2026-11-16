"""A self-signed RSA certificate in plain Python (no `cryptography`: Skypane's compiled build doesn't have it).

The Android TV Remote protocol (v2) needs the client to present a certificate; the TV remembers it after pairing.
make() -> (cert_pem, key_pem). public_numbers(der) -> (modulus, exponent) of a DER certificate (the TV's, for the
pairing secret). Only the standard library: secrets, hashlib, base64, datetime.
"""
import base64
import datetime
import hashlib
import secrets

# ---------- RSA ----------
_SMALL = [p for p in range(3, 2000, 2) if all(p % q for q in range(3, int(p ** .5) + 1, 2))]


def _probable_prime(bits):
    while True:
        n = secrets.randbits(bits) | (1 << (bits - 1)) | (1 << (bits - 2)) | 1
        if any(n % p == 0 for p in _SMALL):
            continue
        d, r = n - 1, 0
        while d % 2 == 0:
            d //= 2
            r += 1
        for _ in range(40):   # Miller-Rabin
            a = secrets.randbelow(n - 3) + 2
            x = pow(a, d, n)
            if x in (1, n - 1):
                continue
            for _ in range(r - 1):
                x = pow(x, 2, n)
                if x == n - 1:
                    break
            else:
                break
        else:
            return n


def rsa_key(bits=2048, e=65537):
    while True:
        p, q = _probable_prime(bits // 2), _probable_prime(bits // 2)
        if p == q:
            continue
        n, phi = p * q, (p - 1) * (q - 1)
        if n.bit_length() != bits or phi % e == 0:
            continue
        d = pow(e, -1, phi)
        return {"n": n, "e": e, "d": d, "p": p, "q": q, "dp": d % (p - 1), "dq": d % (q - 1), "qi": pow(q, -1, p)}


# ---------- DER ----------
def _len(n):
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b


def _tlv(tag, body):
    return bytes([tag]) + _len(len(body)) + body


def _int(v):
    b = v.to_bytes(max(1, (v.bit_length() + 8) // 8), "big")   # (a leading 0 keeps it positive)
    return _tlv(0x02, b)


def _seq(*parts):
    return _tlv(0x30, b"".join(parts))


def _oid(dotted):
    a = [int(x) for x in dotted.split(".")]
    body = bytes([40 * a[0] + a[1]])
    for v in a[2:]:
        enc = [v & 0x7F]
        v >>= 7
        while v:
            enc.insert(0, 0x80 | (v & 0x7F))
            v >>= 7
        body += bytes(enc)
    return _tlv(0x06, body)


def _utf8(s):
    return _tlv(0x0C, s.encode())


def _time(t):
    return _tlv(0x17, t.strftime("%y%m%d%H%M%SZ").encode()) if t.year < 2050 else _tlv(0x18, t.strftime("%Y%m%d%H%M%SZ").encode())


RSA_ENC, SHA256_RSA, CN = "1.2.840.113549.1.1.1", "1.2.840.113549.1.1.11", "2.5.4.3"
_SHA256_INFO = bytes.fromhex("3031300d060960864801650304020105000420")


def _sign(k, data):
    em_len = (k["n"].bit_length() + 7) // 8
    t = _SHA256_INFO + hashlib.sha256(data).digest()
    em = b"\x00\x01" + b"\xff" * (em_len - len(t) - 3) + b"\x00" + t
    m = int.from_bytes(em, "big")
    s1, s2 = pow(m, k["dp"], k["p"]), pow(m, k["dq"], k["q"])   # (CRT)
    s = s2 + k["q"] * ((k["qi"] * (s1 - s2)) % k["p"])
    return s.to_bytes(em_len, "big")


def make(name="Skypane", bits=2048, years=10):
    """(cert_pem, key_pem): a new key and a self-signed certificate for it."""
    k = rsa_key(bits)
    alg = _seq(_oid(SHA256_RSA), b"\x05\x00")
    subject = _seq(_tlv(0x31, _seq(_oid(CN), _utf8(name))))
    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0) - datetime.timedelta(days=1)
    spki = _seq(_seq(_oid(RSA_ENC), b"\x05\x00"), _tlv(0x03, b"\x00" + _seq(_int(k["n"]), _int(k["e"]))))
    tbs = _seq(_tlv(0xA0, _int(2)), _int(secrets.randbits(63) | 1), alg, subject,
               _seq(_time(now), _time(now.replace(year=now.year + years))), subject, spki)
    cert = _seq(tbs, alg, _tlv(0x03, b"\x00" + _sign(k, tbs)))
    key = _seq(_int(0), *(_int(k[x]) for x in ("n", "e", "d", "p", "q", "dp", "dq", "qi")))
    pem = lambda kind, der: (f"-----BEGIN {kind}-----\n" + "\n".join(   # noqa: E731
        base64.b64encode(der).decode()[i:i + 64] for i in range(0, len(base64.b64encode(der)), 64)) + f"\n-----END {kind}-----\n")
    return pem("CERTIFICATE", cert), pem("RSA PRIVATE KEY", key)


# ---------- reading a certificate's public key ----------
def _read(b, i):
    tag = b[i]
    n = b[i + 1]
    i += 2
    if n & 0x80:
        c = n & 0x7F
        n = int.from_bytes(b[i:i + c], "big")
        i += c
    return tag, b[i:i + n], i + n


def public_numbers(der):
    """(modulus, exponent) of an RSA certificate in DER form."""
    _, cert, _ = _read(der, 0)
    _, tbs, _ = _read(cert, 0)
    i, parts = 0, []
    while i < len(tbs):
        tag, body, i = _read(tbs, i)
        parts.append((tag, body))
    if parts[0][0] != 0xA0:
        parts.insert(0, (0xA0, b""))   # (v1: no version field)
    spki = parts[6][1]
    _, alg, j = _read(spki, 0)
    _, bits, _ = _read(spki, j)
    _, rsa, _ = _read(bits[1:], 0)
    _, n, k = _read(rsa, 0)
    _, e, _ = _read(rsa, k)
    return int.from_bytes(n, "big"), int.from_bytes(e, "big")
