# Python cheat sheet — annotated

---

## Data types

Every value in Python has a type. The key distinction: **mutable** types (list, dict, set) can be changed in-place after creation. **Immutable** types (str, tuple, int, float) cannot — operations on them always return a new object.

```python
# numeric
x = 42          # int
x = 3.14        # float
x = 2+3j        # complex
x = 0b1010      # binary → 10
x = 0xFF        # hex → 255
x = 1_000_000   # _ for readability

# sequences (ordered)
s = "hello"     # str — immutable
l = [1,2,3]     # list — mutable
t = (1,2,3)     # tuple — immutable
r = range(10)   # lazy sequence 0-9
b = b"bytes"    # raw bytes

# mappings & sets
d = {"k": "v"}  # dict — key→value
s = {1,2,3}     # set — unique values
fs= frozenset() # immutable set
n = None        # absence of value
b = True/False  # bool (subclass of int)
```

---

## Strings

Strings are immutable sequences of characters. **f-strings** (3.6+) are the modern standard for formatting — prefer them over `%` or `.format()`. Slicing syntax works the same way on lists and tuples too.

```python
# f-strings: embed expressions directly
name = "Jon"
print(f"Hello, {name}!")
print(f"{3.14159:.2f}")   # → 3.14
print(f"{1000:,}")        # → 1,000
print(f"{name!r}")        # → 'Jon' (repr)

# common methods
s.upper() / s.lower()
s.strip()                  # trim whitespace
s.split(",")               # → list
",".join(["a","b"])        # → "a,b"
s.replace("old", "new")
s.startswith("hi")         # → bool
s.find("x")                # → -1 if missing

# slicing: [start : stop : step]
# stop is exclusive, negatives count from end
s = "Python"
s[0:3]    # "Pyt"
s[-3:]    # "hon" (last 3)
s[::-1]   # "nohtyP" (reversed)
s[1::2]   # "yhn" (every 2nd)

# multiline string
text = """line one
line two"""

# raw string — backslashes are literal
# use for regex patterns and Windows paths
path = r"C:\Users\name"
pat  = r"\d+\.\d+"
```

---

## Type conversion

Python won't implicitly convert types — no `"5" + 5`. You convert explicitly with built-in constructors. Conversion can raise exceptions — wrap in try/except when input is untrusted.

```python
int("42")         # → 42
int(3.9)          # → 3 (truncates!)
float("3.14")     # → 3.14
str(100)          # → "100"
bool(0)           # → False
bool([])          # → False (empty = falsy)
bool([0])         # → True (non-empty = truthy)
list((1,2,3))     # tuple → list
set([1,1,2])      # → {1,2} deduplicates
dict(a=1, b=2)    # → {"a":1, "b":2}
```

---

## List methods

Lists are ordered, mutable sequences. Most methods modify the list **in-place and return None** — a common gotcha is writing `lst = lst.sort()` and getting None back. Use `sorted(lst)` when you need a new list.

```python
l = [3,1,2]
l.append(4)       # add one item to end
l.insert(0,9)     # insert at index
l.extend([5,6])   # add multiple items
l.pop()           # remove & return last
l.pop(0)          # remove & return index 0
l.remove(3)       # remove first occurrence
l.sort()          # in-place, returns None!
sorted(l)         # returns a NEW sorted list
l.reverse()       # in-place reverse
l.index(2)        # find index of value
l.count(1)        # count occurrences
l.copy()          # shallow copy
```

---

## Dict methods

Dicts map unique keys to values. Key access with `d["key"]` raises `KeyError` if missing — use `.get()` for safe access. As of Python 3.7+ dicts preserve insertion order.

```python
d = {"a":1, "b":2}
d["a"]              # → 1 (KeyError if missing)
d.get("c", 0)       # → 0 — safe, no exception
d.keys()            # view of keys
d.values()          # view of values
d.items()           # view of (key, value) pairs
d.update({"c":3})   # merge another dict in
d.pop("a")          # remove key, return value
d.pop("x", None)    # safe pop with default
d.setdefault("x",0) # set only if key missing
merged = d1 | d2    # merge into new dict (3.9+)
```

---

## Functions

**`*args`** collects any number of positional arguments into a tuple. **`**kwargs`** collects any number of keyword arguments into a dict. Together they let a function accept anything — you'll see this pattern constantly in decorators and wrappers. The names `args` and `kwargs` are convention only; the `*` and `**` are what matter.

```python
# default arguments
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

greet("Jon")            # Hello, Jon!
greet("Jon", "Hi")      # Hi, Jon!
greet(greeting="Hey", name="Jon")

# *args → tuple of extra positionals
# **kwargs → dict of extra keywords
def fn(*args, **kwargs):
    print(args)    # (1, 2, 3)
    print(kwargs)  # {"x": 10, "y": 20}

fn(1, 2, 3, x=10, y=20)

# keyword-only: args after * must be named
def connect(host, *, port=8080, ssl=True):
    pass
connect("localhost", port=443)

# type hints — not enforced at runtime
# they're documentation + IDE/linter help
def add(a: int, b: int) -> int:
    return a + b

# lambda: one-liner anonymous function
# body must be a single expression
sq  = lambda x: x ** 2
add = lambda x, y: x + y

# useful with sorted/map/filter
sorted(users, key=lambda u: u.age)
```

---

## Control flow

Beyond basic if/else, Python has a few modern additions: the **walrus operator** (`:=`) assigns and tests in one step. **match/case** (3.10+) is structural pattern matching — more powerful than a switch statement.

```python
# ternary — value if condition else other
label = "even" if n % 2 == 0 else "odd"

# walrus (:=) assigns while testing
# avoids calling len(data) twice
if (n := len(data)) > 10:
    print(f"{n} items, truncating")

# also useful in while loops
while chunk := f.read(8192):
    process(chunk)

# match/case (3.10+)
# _ is the wildcard "catch all" case
match status:
  case 200:        print("ok")
  case 404:        print("not found")
  case 500 | 503:  print("server error")
  case _:          print("unknown")

# can also match on structure
match point:
  case (0, 0):   print("origin")
  case (x, 0):   print(f"x-axis at {x}")
  case (x, y):   print(f"point {x},{y}")
```

---

## Unpacking

Unpacking assigns items from a sequence to variables in one step. The **star operator** (`*`) absorbs the remaining items into a list — it can appear anywhere in the assignment.

```python
a, b, c = [1, 2, 3]

# star collects the "rest"
first, *rest = [1,2,3,4]  # rest=[2,3,4]
*init, last  = [1,2,3,4]  # init=[1,2,3]
a, *_, b     = [1,2,3,4]  # ignore middle

# swap without a temp variable
a, b = b, a

# unpack in for loops
pairs = [(1,"a"), (2,"b")]
for num, letter in pairs:
    print(num, letter)

# enumerate gives (index, value) pairs
for i, val in enumerate(lst, start=1):
    print(i, val)
```

---

## Comprehensions

Comprehensions are concise, readable ways to build collections from iterables. **Generator expressions** (using `()`) are like list comprehensions but **lazy** — they produce values one at a time without building the full list in memory. Use them when iterating over large datasets.

```python
# list — builds the full list immediately
squares = [x**2 for x in range(10)]
evens   = [x for x in range(20) if x%2==0]

# dict comprehension
inv = {v: k for k, v in d.items()}

# set comprehension (auto-deduplicates)
domains = {e.split("@")[1] for e in emails}

# inline conditional per item
clamped = [x if x>0 else 0 for x in vals]

# generator — lazy, no list in memory
# use when you only iterate once
gen = (x**2 for x in range(1_000_000))
sum(gen)   # never stores 1M items

# flatten a nested list
matrix = [[1,2],[3,4],[5,6]]
flat = [x for row in matrix for x in row]
# → [1, 2, 3, 4, 5, 6]

# pass generator directly to built-ins
max(x**2 for x in data)  # no extra []
```

---

## Decorators

A decorator is a function that **wraps another function** to add behavior before or after it runs — without changing the original function's code. You apply one with the `@` syntax, which is shorthand for `fn = decorator(fn)`. The inner `wrapper(*args, **kwargs)` uses `*args` and `**kwargs` so it can forward **any** arguments to the original function — this makes the decorator work on functions with any signature. `@functools.wraps` preserves the original function's name and docstring (without it, all decorated functions would appear to be named "wrapper").

```python
import functools

# --- basic decorator ---
def log(func):
  # wraps copies __name__, __doc__ etc.
  @functools.wraps(func)
  def wrapper(*args, **kwargs):
    # *args & **kwargs forward ANYTHING
    # the original function accepts
    print(f"calling {func.__name__}")
    result = func(*args, **kwargs)
    print(f"done")
    return result   # return original result!
  return wrapper    # return the wrapper fn

@log               # same as: add = log(add)
def add(a, b):
  return a + b

add(1, 2)   # logs, then returns 3


# --- practical example: timing ---
import time

def timer(func):
  @functools.wraps(func)
  def wrapper(*args, **kwargs):
    start = time.perf_counter()
    result = func(*args, **kwargs)
    end = time.perf_counter()
    print(f"{func.__name__} took {end-start:.4f}s")
    return result
  return wrapper

@timer
def slow_fn(n):
  time.sleep(n)

slow_fn(1)  # slow_fn took 1.0001s


# --- decorator with arguments ---
# need an extra outer function
# to accept the decorator's own args
def retry(times=3):
  def decorator(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
      for i in range(times):
        try:
          return func(*args, **kwargs)
        except Exception:
          if i == times - 1: raise
    return wrapper
  return decorator

@retry(times=5)
def fetch(url): ...
```

---

## Classes & OOP

**`@classmethod`** receives the class itself (not an instance) as the first arg — use it for alternative constructors. **`@staticmethod`** receives neither — it's just a regular function namespaced to the class. **`@property`** lets you define getter/setter logic while keeping attribute-style access on the outside.

```python
class Animal:
  species = "unknown"    # class var — shared

  def __init__(self, name: str):
    self._name = name      # instance var

  # @property: access like an attribute
  # but runs code when accessed
  @property
  def name(self): return self._name

  @name.setter
  def name(self, v):
    if not v: raise ValueError("empty")
    self._name = v

  # @classmethod: first arg is the class
  # useful for alternative constructors
  @classmethod
  def from_dict(cls, data: dict):
    return cls(data["name"])

  # @staticmethod: no self or cls
  # just a utility fn grouped with the class
  @staticmethod
  def is_valid_name(name: str) -> bool:
    return bool(name.strip())


# inheritance — pass parent in class def
class Dog(Animal):
  def __init__(self, name, breed):
    super().__init__(name)  # call parent
    self.breed = breed

  # override parent method
  def speak(self) -> str:
    return "Woof!"

# multiple inheritance
class C(A, B): pass

# check type relationships
isinstance(dog, Animal)  # True
issubclass(Dog, Animal)  # True
```

---

## Error handling

The **else** block runs only if no exception was raised — use it for code that should run on success. **finally** always runs regardless — use it for cleanup like closing connections.

```python
try:
  result = 10 / x
except ZeroDivisionError:
  print("can't divide by zero")
except (TypeError, ValueError) as e:
  print(f"bad input: {e}")
else:
  # only runs if NO exception raised
  print(f"result: {result}")
finally:
  # always runs — cleanup goes here
  print("done")

# raise built-in or custom exception
raise ValueError("must be positive")

# define custom exception types
class AppError(Exception): pass
raise AppError("something went wrong")
```

---

## Generators

**yield** pauses the function and hands a value to the caller — the function resumes from where it left off on the next call. Unlike returning a list, generators produce values **one at a time**, which is memory-efficient for large or infinite sequences.

```python
# function resumes after yield each time
def countdown(n):
  while n > 0:
    yield n   # pauses here, returns n
    n -= 1    # resumes here on next call

for i in countdown(3):
    print(i)      # 3, 2, 1

# yield from — delegate to sub-iterator
def chain(*iterables):
  for it in iterables:
    yield from it  # same as: for x in it: yield x

# infinite generator — only safe with break
def integers(n=0):
  while True:
    yield n
    n += 1
```

---

## File I/O

Always use `with open(...)` — it guarantees the file is closed even if an exception occurs. **pathlib.Path** is the modern way to handle file paths — cross-platform and more readable than string manipulation.

```python
# read entire file as string
with open("f.txt") as f:
    text  = f.read()       # whole file
    lines = f.readlines()  # list of lines

# write (overwrites) / append
with open("f.txt", "w") as f:
    f.write("hello\n")

# modes: r(read) w(write) a(append)
#        rb/wb for binary files

# pathlib — modern path handling
from pathlib import Path
p = Path("data") / "file.txt"
p.read_text()   # reads without open()
p.exists()      # True/False
p.suffix        # ".txt"

# json read/write
import json
data = json.loads(p.read_text())
p.write_text(json.dumps(data, indent=2))
```

---

## Async / await

Async lets your program do other work **while waiting** on I/O (network, disk) instead of blocking. `await` pauses the current coroutine and yields control back — it doesn't block the whole program. Use **asyncio.gather()** to run multiple coroutines concurrently. Good fit for: web requests, database queries, file I/O. Not needed for CPU-heavy work (use multiprocessing instead).

```python
import asyncio

# async def creates a "coroutine"
# it doesn't run until awaited
async def fetch(url: str):
  print(f"fetching {url}...")
  await asyncio.sleep(1)  # non-blocking wait
  return f"data from {url}"

async def main():
  # sequential — 2s total
  r1 = await fetch("url1")
  r2 = await fetch("url2")

  # gather runs coroutines CONCURRENTLY
  r1, r2, r3 = await asyncio.gather(
    fetch("url1"),
    fetch("url2"),
    fetch("url3"),
  )
  # all 3 run at once → ~1s total

asyncio.run(main())  # entry point

# async context managers & iterators
async with aiofiles.open("f") as f:
    data = await f.read()

async for item in async_generator():
    process(item)
```

---

## Useful built-ins

Available everywhere without importing. Underused ones: **any()/all()** test booleans across an iterable. **zip()** pairs up multiple iterables. **vars()** returns an object's `__dict__`.

```python
len(x)            type(x)
range(start, stop, step)
isinstance(x, T)  # preferred over type(x)==T
sorted(x, key=fn, reverse=True)
enumerate(x, start=0)
zip(a, b, c)      # stops at shortest
map(fn, x)        # lazy — returns iterator
filter(fn, x)     # lazy — returns iterator
any(x>0 for x in lst)  # any True?
all(x>0 for x in lst)  # all True?
sum(x)  min(x)  max(x)
abs(x)  round(x, ndigits)
dir(x)   # list attributes/methods
vars(x)  # return __dict__
id(x)    # memory address (used with is)
```

---

## Common gotchas

These catch almost every Python developer at some point. The mutable default argument is especially sneaky — the default is created **once** when the function is defined, not on each call.

```python
# 1. mutable default argument
def bad(lst=[]):       # [] created ONCE
  lst.append(1)
  return lst
bad()  # [1]
bad()  # [1, 1] ← surprise!

def good(lst=None):    # correct pattern
  if lst is None: lst = []

# 2. is vs ==
a == b   # same value?
a is b   # same object in memory?
# use `is` only for None, True, False

# 3. late binding in closures
fns = [lambda: i for i in range(3)]
fns[0]()  # → 2, not 0! (i=2 at call time)
# fix: lambda i=i: i  (capture at def time)

# 4. copying vs referencing
a = [1,2,3]
b = a        # b points to same list!
b = a.copy() # shallow copy
```

---

## Dunder (magic) methods

Dunder methods let your classes integrate with Python's built-in syntax and functions. Implement them and your objects work naturally with `len()`, `for` loops, `with` blocks, operators, and more.

| Method                            | Triggered by                                |
| --------------------------------- | ------------------------------------------- |
| `__init__(self, ...)`             | `MyClass()` constructor                     |
| `__str__` / `__repr__`            | `str(obj)` for users / `repr(obj)` for devs |
| `__len__(self)`                   | `len(obj)` — must return int                |
| `__getitem__` / `__setitem__`     | `obj[key]` read / `obj[key] = val` write    |
| `__contains__(self, x)`           | `x in obj` — return bool                    |
| `__iter__` / `__next__`           | makes obj usable in `for` loops             |
| `__enter__` / `__exit__`          | `with obj:` — setup and teardown            |
| `__eq__` / `__lt__` / `__gt__`    | `==` `<` `>` comparison operators           |
| `__add__` / `__mul__` / `__sub__` | `obj + x` `obj * x` `obj - x`               |
| `__call__(self, ...)`             | `obj()` — makes instance callable like a fn |
| `__hash__(self)`                  | `hash(obj)` — required to use as dict key   |
| `__bool__(self)`                  | `if obj:` — truthiness of your object       |