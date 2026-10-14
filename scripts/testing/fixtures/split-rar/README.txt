RHFiles-owned multi-volume RAR regression fixture.

The five volumes contain one payload.bin, 16,384 deterministic bytes generated
by xorshift32 with initial state 0x12345678. No downloaded or private data.
Created with WinRAR 7.1: rar a -v4k -m0 -ep -idq -y sample.rar payload.bin
Volume names were padded to part01..part05. WinRAR software is not included.

Regenerate using scripts/testing/create-split-rar-fixture.mjs into a new empty
fixture directory. Tests extract with RHFiles' bundled 7-Zip and compare bytes.
