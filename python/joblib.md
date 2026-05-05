# joblib

> **What it is:** A Python library for easy parallelism, disk caching, and fast serialization — built for data and ML pipelines.
> **When to reach for it:** You have a slow `for` loop, an expensive function you're calling repeatedly with the same inputs, or a large NumPy-heavy object to persist to disk.

---

## Parallelism — `Parallel` + `delayed`

### Basic Usage

`Parallel` replaces a `for` loop. `delayed` defers a function call so joblib can dispatch it across workers.

```python
from joblib import Parallel, delayed

def process(x):
    return x ** 2

# sequential equivalent: [process(i) for i in range(100)]
results = Parallel(n_jobs=-1)(delayed(process)(i) for i in range(100))
```

The generator inside `Parallel(...)()` reads exactly like a list comprehension — the only difference is wrapping the function with `delayed`.

**Key parameters:**

| Parameter | Default | Description |
|---|---|---|
| `n_jobs` | `1` | Number of workers. `-1` = all cores, `-2` = all but one. |
| `backend` | `'loky'` | Execution backend. See [Choosing the Right Backend](#choosing-the-right-backend). |
| `verbose` | `0` | Values > 0 print job progress. |
| `prefer` | `None` | `'threads'` or `'processes'` — shorthand for common backends. |
| `require` | `None` | `'sharedmem'` forces a thread-based backend. |
| `pre_dispatch` | `'2*n_jobs'` | How many jobs to pre-dispatch. Tune for memory-heavy tasks. |
| `return_as` | `'list'` | `'generator'` to get results lazily as workers finish. |
| `timeout` | `None` | Seconds before a worker raises `TimeoutError`. |

---

### Backends

```python
# default — process-based, safe, good for CPU-bound work
Parallel(n_jobs=4, backend='loky')(...)

# thread-based — low overhead, good for I/O-bound or NumPy/pandas work
Parallel(n_jobs=4, backend='threading')(...)
```

For context-manager style (temporarily overriding the backend):

```python
from joblib import parallel_backend

with parallel_backend('threading', n_jobs=4):
    results = Parallel()(delayed(fn)(x) for x in data)
```

---

### Progress with tqdm

joblib's built-in verbosity is coarse. For a tqdm progress bar, use `return_as='generator'`:

```python
from tqdm import tqdm

jobs = (delayed(process)(i) for i in range(100))
results = list(tqdm(
    Parallel(n_jobs=-1, return_as='generator')(jobs),
    total=100
))
```

---

### Returning Multiple Values

```python
def process(x):
    return x, x ** 2

pairs = Parallel(n_jobs=-1)(delayed(process)(i) for i in range(10))
inputs, outputs = zip(*pairs)
```

---

### Error Handling

Exceptions in workers propagate back to the main process after all workers finish. To surface errors early, wrap your worker:

```python
def safe_process(x):
    try:
        return process(x), None
    except Exception as e:
        return None, str(e)

results = Parallel(n_jobs=-1)(delayed(safe_process)(i) for i in data)
values, errors = zip(*results)
```

---

## Caching — `Memory`

### Basic Usage

`Memory` memoizes function calls to disk. On subsequent calls with identical arguments, the result is loaded from cache instead of recomputing.

```python
from joblib import Memory

mem = Memory(location=".cache", verbose=0)

@mem.cache
def load_and_process(filepath, n_rows):
    # runs once per unique (filepath, n_rows) combination
    import pandas as pd
    return pd.read_csv(filepath, nrows=n_rows).dropna()
```

**Cache key** = function source code + argument values. Changing the function body or passing different arguments both produce a cache miss.

**`Memory` parameters:**

| Parameter | Default | Description |
|---|---|---|
| `location` | required | Directory path for the cache store. |
| `verbose` | `1` | `0` silences all cache hit/miss messages. |
| `bytes_limit` | `None` | Max cache size as `int` (bytes) or `'1G'`, `'500M'`. |
| `mmap_mode` | `None` | NumPy memory-map mode for large arrays: `'r'`, `'r+'`, `'c'`. |

---

### Cache Invalidation

The cache invalidates automatically when function arguments or the **function's source code** changes. It does **not** invalidate when:
- A dependency of the function changes (a helper it calls)
- Data at a file path changes on disk (path string is still the same)
- You upgrade a library that affects computation

For file-based inputs, pass a hash or modification timestamp as an argument:

```python
import os

@mem.cache
def load_data(filepath, mtime):  # mtime ensures cache busts when file changes
    return pd.read_parquet(filepath)

mtime = os.path.getmtime("data.parquet")
df = load_data("data.parquet", mtime)
```

---

### Cache Management

```python
load_and_process.clear()         # clear this function's cache
mem.clear(warn=False)            # clear the entire cache directory
mem.reduce_size(bytes_limit="500M")  # evict LRU entries to fit limit

load_and_process.call(*args)     # force recompute + overwrite cache

result_ref = load_and_process.call_and_shelve(*args)  # lazy handle
data = result_ref.get()
```

---

### Ignoring Arguments

Exclude arguments from the cache key (e.g., verbose flags that don't affect output):

```python
@mem.cache(ignore=['verbose'])
def compute(data, n_components, verbose=False):
    ...
```

---

## Serialization — `dump` / `load`

Faster than `pickle` for objects containing large NumPy arrays. The standard choice for persisting scikit-learn models.

```python
from joblib import dump, load

dump(obj, "artifact.joblib")
obj = load("artifact.joblib")
```

### Compression

```python
dump(obj, "artifact.joblib", compress=3)              # zlib, level 1–9
dump(obj, "artifact.joblib", compress=('lz4', 3))     # fast, decent ratio
dump(obj, "artifact.joblib", compress=('zlib', 6))    # balanced
dump(obj, "artifact.joblib", compress=('gzip', 9))    # max compression, slowest
```

**Rule of thumb:** `compress=3` (zlib) is a sensible default. Use `lz4` when write speed matters more than file size.

### Multiple Objects

`dump` may split large objects across multiple files. Store multiple objects as a dict instead of calling `dump` multiple times:

```python
dump({"model": model, "scaler": scaler, "features": feature_list}, "bundle.joblib")
bundle = load("bundle.joblib")
model = bundle["model"]
```

---

## Common Patterns

### Parallel DataFrame Processing

```python
import numpy as np
import pandas as pd
from joblib import Parallel, delayed

def process_chunk(df_chunk):
    df_chunk["feature"] = df_chunk["value"] ** 2
    return df_chunk

n_workers = 4
chunks = np.array_split(df, n_workers)
results = Parallel(n_jobs=n_workers, backend='threading')(
    delayed(process_chunk)(c) for c in chunks
)
df_out = pd.concat(results, ignore_index=True)
```

Use `'threading'` here — pandas/NumPy operations release the GIL, so threading beats `loky` for pure DataFrame work.

### Caching Expensive Pipeline Steps

```python
from joblib import Memory
mem = Memory(".cache", verbose=0)

@mem.cache
def load_raw(path, mtime):
    return pd.read_parquet(path)

@mem.cache
def compute_features(df_hash, df):
    ...
    return features

mtime = os.path.getmtime(DATA_PATH)
raw = load_raw(DATA_PATH, mtime)
features = compute_features(hash(raw.to_string()), raw)
```

### Parallel Grid Search (Manual)

```python
from itertools import product
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score

param_grid = {
    "n_estimators": [50, 100, 200],
    "max_depth": [3, 5, None],
}

def evaluate(params, X, y):
    model = RandomForestClassifier(**params)
    scores = cross_val_score(model, X, y, cv=3)
    return {**params, "mean_cv": scores.mean()}

combos = [dict(zip(param_grid, v)) for v in product(*param_grid.values())]
results = Parallel(n_jobs=-1)(delayed(evaluate)(p, X, y) for p in combos)
```

### Persisting Scikit-Learn Models

```python
from joblib import dump, load

dump(pipeline, "pipeline.joblib")

pipeline = load("pipeline.joblib")
predictions = pipeline.predict(X_test)
```

Prefer `.joblib` over `.pkl` for sklearn objects — significantly faster for models with large embedded arrays.

---

## Pitfalls & Gotchas

### Parallelism

**`delayed` must wrap a named function — not a lambda.**
Lambdas can't be pickled by the `loky` backend.

```python
# ❌ will raise PicklingError
Parallel(n_jobs=-1)(delayed(lambda x: x**2)(i) for i in range(10))

# ✅
def square(x): return x**2
Parallel(n_jobs=-1)(delayed(square)(i) for i in range(10))
```

**Large return values are expensive.** Each worker serializes its result and sends it to the main process. Aggregate inside the worker where possible.

**Nested `Parallel` calls are silently flattened.** joblib detects nested parallelism and runs the inner loop sequentially. Set inner `Parallel(n_jobs=1)` explicitly if this is intentional.

**Windows requires `if __name__ == "__main__":`**

```python
if __name__ == "__main__":
    results = Parallel(n_jobs=-1)(delayed(fn)(x) for x in data)
```

Not required in Jupyter notebooks.

**Shared mutable state doesn't work across processes.** Each `loky` worker gets a copy of your data, not a reference. Collect return values instead.

```python
# ❌ shared_list will not be modified in the main process
shared_list = []
def bad_worker(x):
    shared_list.append(x)  # modifies the worker's copy only

# ✅ collect return values
results = Parallel(n_jobs=-1)(delayed(fn)(x) for x in data)
```

---

### Caching

**File content changes are invisible to the cache.** The cache key includes the file *path string*, not its contents. If `data.csv` changes on disk, the cached result is stale. Pass `mtime` or a content hash as an explicit argument.

**Changing a dependency doesn't bust the cache.** If `@mem.cache`-d function `A` calls helper `B`, changing `B`'s source code does not invalidate `A`'s cache.

**Cache bloat.** joblib never evicts entries automatically unless you call `mem.reduce_size()`. Set a `bytes_limit` on `Memory` or add cache cleanup to your workflow.

---

### Serialization

**`.joblib` files are not portable across Python versions or major library versions.** Treat them as ephemeral artifacts, not long-term storage. Pin versions or re-serialize after upgrades.

**`dump` may write multiple files.** Large arrays trigger side-car `.npy` files alongside the main file. Move or copy the entire directory, not just `artifact.joblib`.

---

## Choosing the Right Backend

| Situation | Recommended Backend | Reason |
|---|---|---|
| CPU-bound Python code | `loky` (default) | Bypasses the GIL via separate processes |
| NumPy / pandas heavy | `threading` | NumPy releases the GIL; no process spawn overhead |
| I/O-bound (file reads, network) | `threading` | GIL is released during I/O |
| Must share memory | `threading` or `require='sharedmem'` | Only threads truly share memory |

---

## Quick Reference

```python
from joblib import Parallel, delayed, parallel_backend, Memory, dump, load

# parallel
Parallel(n_jobs=-1)(delayed(fn)(x) for x in data)
Parallel(n_jobs=4, backend='threading', verbose=10)(...)
Parallel(n_jobs=-1, return_as='generator')(...)  # lazy results for tqdm

with parallel_backend('threading', n_jobs=4):
    Parallel()(delayed(fn)(x) for x in data)

# cache
mem = Memory(location=".cache", verbose=0, bytes_limit="2G")

@mem.cache
def fn(a, b): ...

@mem.cache(ignore=['verbose'])
def fn(a, b, verbose=False): ...

fn.clear()                # clear this function's cache
mem.clear(warn=False)     # clear entire cache
mem.reduce_size()         # evict to fit bytes_limit
fn.call(*args)            # force recompute + overwrite cache

# serialization
dump(obj, "file.joblib")
dump(obj, "file.joblib", compress=3)
obj = load("file.joblib")
```
