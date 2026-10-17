# FlashPro Express `.job` container: layout and an in-browser header parser (for WP-36)

Measured on `BASE_DESIGN_ES_FD0AEBB95776A72.job` (12,260,015 bytes) from the reference-design release
v2026.04 by `tools/content/extract_jobfile.py`, which asserts every rule below. No Microchip document
describes the container; this is what the bytes show. Everything not listed is unknown.

## 1. Byte layout

```
offset 0      ASCII text header, LF line ends (no CR), 8 lines:
                1  job file name                      "BASE_DESIGN_ES_FD0AEBB95776A72.job"
                2  container format version           "2.0"
                3  creation date, C ctime() format    "Thu Apr 30 16:47:14 2026"
                4  flag "true"/"false"                "false"   (meaning not known)
                5  flag                               "false"   (meaning not known)
                6  flag                               "false"   (meaning not known)
                7  empty line
                8  N = decimal byte length of the manifest block that starts on the next byte   "157"
offset H      manifest block, exactly N bytes (here H = 87, N = 157):
                "<H" + 14 x "<" + LF                  start marker
                one LF-terminated line per member:  <name>|<flagA>|<flagB>|<size in bytes>
                  BASE_DESIGN_ES_FD0AEBB95776A72.ppd%40prg|false|false|12256083
                  BASE_DESIGN_ES_FD0AEBB95776A72.pro%40set|false|false|2935
                  XML|false|false|706
offset H+N    "<M" + 14 x "<" + LF                    end marker (17 bytes)
offset H+N+17 the members, in manifest order. Each member is <size> bytes followed by 10 NUL bytes.
              The last member's 10 NULs end the file: H + N + 17 + sum(size + 10) == file length.
```

Member names are percent-encoded (`%40` is `@`). The part after `@` names the role:

| Member | Role | Content |
|---|---|---|
| `<design>.ppd@prg` | programming data | a standard ZIP archive (PKZIP local headers, central directory, end-of-central-directory record with no comment) |
| `<design>.pro@set` | FlashPro project | UTF-8 XML `<project name=… version="1.2">`: per-programmer TCK/SCK, device name, IR length, MaxTCK |
| `XML` | job export | UTF-8 XML `<job_export>`: device name, `jtagIRSize`, `jtagMaxTCK`, `isBypass` |

`flagA`/`flagB` are always `false` here; their meaning is not known.

## 2. The PPD ZIP

| Entry | Method | Compressed | Size | Use |
|---|---|---|---|---|
| `ZIP_VERSION` | deflate | 5 | 3 | text `1.0` |
| `header.xml` | deflate | 6,490 | 75,660 | the facts the panel shows (one line of XML, namespace `http://actel.com/sweng/afi`) |
| `pgm.map` | deflate | 12,249,282 | 76,885,860 | the bitstream. **Never inflate or keep it.** |

`header.xml` children used by the twin: `design`, `inDie`, `inFamily`, `extDie`, `extFam`, `inPackage`,
`speedGrade`, `tempGrade`, `silsig`, `chksum`, `Device_Info@idcode`, `Device_Info@idmask`,
`Device_BSR_Pattern@BsrLength`, `bitstream_digest`, `design_version`, `action`, `program_fabric`,
`program_snvm`, `program_envm0`, `verify_fabric`, `verify_envm0`, `verify_envm1`, `verify_snvm`,
`verify_security`, `erase_*`, `numOfComponents`, `numOfFrames`, and `BSR_IO_States/IO_State`
(`index`, `number` = ball, `name` = port, `macro_cell`). Booleans are `true`/`false` for `program_*`
and `1`/`0` for `verify_*`/`erase_*`.

## 3. Parsing a user's `.job` in the browser (no bitstream kept)

1. `file.slice(0, 4096).arrayBuffer()`; decode as ASCII. Split on `\n`. Check line 2 is `2.0` and the
   `<H<<<<<<<<<<<<<<` marker follows line 8. Read N from line 8.
2. Parse the N-byte manifest; check the `<M<<<<<<<<<<<<<<\n` marker sits at H+N. Compute each member's
   offset: start = H+N+17, then `offset += size + 10`. Check the total equals `file.size` (else reject).
3. For the `@prg` member, read the last 22 bytes of the member (`file.slice(end-22, end)`): the
   end-of-central-directory record `PK\x05\x06`; read the central directory offset (u32 at +16) and
   size (u32 at +12), relative to the member start. Slice the central directory (a few hundred bytes) and
   find the entries `header.xml` and `ZIP_VERSION`: compressed size (u32 at +20), method (u16 at +10), local
   header offset (u32 at +42).
4. For each wanted entry slice its 30-byte local header, skip `30 + nameLen + extraLen` (u16 at +26 and
   +28), slice `compressedSize` bytes and inflate with
   `new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()`.
   Only ~6.5 KB is read for `header.xml`; `pgm.map` is never sliced.
5. `new DOMParser().parseFromString(xml, 'application/xml')`; read the fields in section 2 with
   `getElementsByTagNameNS('http://actel.com/sweng/afi', …)` (the `BSR_IO_States` subtree has `xmlns=""`).
6. Parse the `@set` member (2,935 bytes) and the `XML` member (706 bytes, starts with LF) as UTF-8 XML for
   TCK/SCK/MaxTCK/IR length.
7. Compare with `base_design_es_2026_04.json` and show the differences (idcode `0f81a1cf` = ES die,
   `1f81a1cf` = production die).

Reject the file if any marker, length or ZIP signature check fails; never execute or store its content.

## 4. `_job.digest` (text, 7 lines)

`Design name:`, `Checksum:`, `Design version:`, then SHA-256 of the fabric, eNVM and sNVM components and
of the entire bitstream. `Entire bitstream digest` equals `header.xml` `bitstream_digest`; `Checksum`
equals `chksum`; both are asserted by the extractor.
