import sys
src = sys.argv[1]
dst = sys.argv[2]
prefixes = (r"\restrict ", r"\unrestrict ", "SET transaction_timeout")
with open(src, 'r', encoding='utf-8', errors='replace') as fi, open(dst, 'w', encoding='utf-8') as fo:
    n_in = 0
    n_out = 0
    n_skip = 0
    for line in fi:
        n_in += 1
        if any(line.startswith(p) for p in prefixes):
            n_skip += 1
            continue
        fo.write(line)
        n_out += 1
print(f"in={n_in} out={n_out} skipped={n_skip}")
