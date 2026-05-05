# Pydantic v2

> Covers Pydantic **v2** (2.x). Key method names differ from v1 — see the [v1 vs v2 quick reference](#v1-vs-v2-quick-reference).

---

## Mental Model

Pydantic lets you define data contracts as Python classes with type annotations. At instantiation time, it:

1. **Coerces** values into declared types where possible (`"30"` → `30`)
2. **Validates** values against constraints (ranges, lengths, patterns)
3. **Raises** a structured `ValidationError` if anything fails

Think of it as a schema + parser + serializer in one — backed entirely by type hints.

**Reach for it when you need:**
- Validated config objects at startup
- Typed API request/response bodies (FastAPI uses it natively)
- Structured input to ML pipelines or data processing steps
- Anything where "garbage in → garbage out" is unacceptable

---

## Defining Models

```python
from pydantic import BaseModel

class User(BaseModel):
    name: str
    age: int
    email: str
```

Every field is declared as a class attribute with a type annotation. Pydantic inspects these at class creation time and builds a schema.

```python
u = User(name="Jon", age=30, email="jon@example.com")

u.name               # "Jon"
u.age                # 30
u.model_dump()       # {'name': 'Jon', 'age': 30, 'email': 'jon@example.com'}
u.model_dump_json()  # '{"name":"Jon","age":30,"email":"jon@example.com"}'
```

### ValidationError

```python
from pydantic import ValidationError

try:
    User(name="Jon", age="not-a-number", email="x")
except ValidationError as e:
    print(e)           # human-readable summary
    print(e.errors())  # structured list of dicts — good for logging
```

Each error dict contains: `loc` (field path), `msg` (human message), `type` (error code), `input` (what was passed).

---

## Field Types & Annotations

Pydantic supports all standard Python types and many from `typing`:

```python
from typing import Any, Union
from pydantic import BaseModel

class Example(BaseModel):
    # primitives
    name: str
    count: int
    ratio: float
    active: bool

    # collections
    tags: list[str]            # Python 3.9+
    coords: tuple[float, float]
    ids: set[int]
    meta: dict[str, Any]

    # Union / Optional
    score: int | None = None   # Python 3.10+
    value: Union[str, int] = "default"

    # Literals
    from typing import Literal
    status: Literal["active", "inactive"] = "active"
```

### Type Coercion Behaviour

Pydantic coerces by default:

| Input | Declared type | Result |
|-------|---------------|--------|
| `"42"` | `int` | `42` |
| `1` | `bool` | `True` |
| `"true"` | `bool` | `True` |
| `["a", "b"]` | `set[str]` | `{"a", "b"}` |
| `{"city": "LA"}` | `Address` (model) | `Address(city="LA")` |

> **Pitfall:** Coercion is silent. `"42"` becoming `42` is convenient; it can also hide upstream data quality problems. Use `model_config = {"strict": True}` to disable coercion where correctness matters more than convenience.

---

## Field Constraints with `Field()`

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: float = Field(gt=0, description="Must be positive")
    quantity: int = Field(ge=0, default=0)
    sku: str = Field(pattern=r"^[A-Z]{3}-\d{4}$")
    internal_id: str = Field(alias="internalId")  # accept camelCase input
```

### Numeric Constraints

| Constraint | Meaning |
|------------|---------|
| `gt=n` | greater than n |
| `ge=n` | greater than or equal to n |
| `lt=n` | less than n |
| `le=n` | less than or equal to n |
| `multiple_of=n` | must be a multiple of n |

### String Constraints

| Constraint | Meaning |
|------------|---------|
| `min_length=n` | minimum character count |
| `max_length=n` | maximum character count |
| `pattern=r"..."` | must match regex |

### Collection Constraints

```python
tags: list[str] = Field(min_length=1, max_length=10)  # list length bounds
```

---

## Optional Fields & Defaults

```python
from pydantic import BaseModel

class Config(BaseModel):
    host: str = "localhost"     # has a default — optional
    port: int = 5432
    debug: bool = False
    tag: str | None = None      # optional, defaults to None
```

### Required vs Optional

- **No default** — field is required; omitting it raises `ValidationError`
- **Default value** — field is optional, falls back to default
- **`Optional[T]` without a default** — field is still **required**, but accepts `None` as a value

```python
class Example(BaseModel):
    required_nullable: str | None    # required — must explicitly pass None or a str
    optional_nullable: str | None = None  # truly optional
```

> **Common pitfall:** `Optional[str]` does not mean "this field can be omitted." It only means the value can be `None`.

### Default Factories

Use `default_factory` for mutable defaults (lists, dicts, sets):

```python
from pydantic import Field

class Pipeline(BaseModel):
    steps: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
```

---

## Nested Models

```python
class Address(BaseModel):
    city: str
    zip: str

class Person(BaseModel):
    name: str
    address: Address
```

Pydantic auto-coerces dicts into nested models:

```python
p = Person(name="Jon", address={"city": "LA", "zip": "90001"})
p.address.city  # "LA"
```

### Lists of Models

```python
class Order(BaseModel):
    items: list[Product]

order = Order(items=[{"name": "Widget", "price": 9.99}])
# each dict is coerced into a Product
```

### Discriminated Unions

When a field could be one of several model types, use a discriminator for efficient parsing:

```python
from typing import Annotated, Union, Literal
from pydantic import BaseModel, Field

class Cat(BaseModel):
    type: Literal["cat"]
    indoor: bool

class Dog(BaseModel):
    type: Literal["dog"]
    breed: str

class Pet(BaseModel):
    animal: Annotated[Union[Cat, Dog], Field(discriminator="type")]

Pet(animal={"type": "dog", "breed": "Husky"})
```

---

## Validation: Built-in & Custom

### `@field_validator`

Runs on a single field. Receives the raw value, returns the (optionally transformed) value or raises `ValueError`.

```python
from pydantic import BaseModel, field_validator

class User(BaseModel):
    email: str
    username: str

    @field_validator("email")
    @classmethod
    def email_must_contain_at(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("invalid email address")
        return v.lower()  # validators can transform values

    @field_validator("email", "username")
    @classmethod
    def no_spaces(cls, v: str) -> str:
        if " " in v:
            raise ValueError("no spaces allowed")
        return v
```

### `@model_validator`

Runs on the whole model — use when validation logic spans multiple fields.

```python
from pydantic import model_validator

class DateRange(BaseModel):
    start: int
    end: int

    @model_validator(mode="after")
    def check_range(self) -> "DateRange":
        if self.end <= self.start:
            raise ValueError("end must be greater than start")
        return self
```

`mode="before"` receives raw input data (dict), `mode="after"` receives the constructed model instance.

### Reusable validators with `Annotated`

```python
from typing import Annotated
from pydantic import AfterValidator

def must_be_positive(v: float) -> float:
    if v <= 0:
        raise ValueError("must be positive")
    return v

PositiveFloat = Annotated[float, AfterValidator(must_be_positive)]

class Invoice(BaseModel):
    amount: PositiveFloat
```

---

## Parsing & Serialization

### Parsing

```python
# from keyword arguments (standard)
user = User(name="Jon", age=30, email="j@x.com")

# from dict
user = User.model_validate({"name": "Jon", "age": 30, "email": "j@x.com"})

# from JSON string
user = User.model_validate_json('{"name":"Jon","age":30,"email":"j@x.com"}')

# from ORM object / arbitrary object with attributes
user = User.model_validate(orm_obj, from_attributes=True)
```

### Serialization

```python
user.model_dump()                       # to dict
user.model_dump(exclude_none=True)      # exclude None values
user.model_dump(include={"name", "email"})  # only specific fields
user.model_dump(exclude={"age"})        # exclude specific fields
user.model_dump(by_alias=True)          # use field aliases as keys

user.model_dump_json()                  # to JSON string
user.model_dump_json(exclude_none=True)
```

### Schema

```python
User.model_json_schema()  # returns OpenAPI-compatible JSON schema dict
```

---

## Model Config

```python
from pydantic import BaseModel, ConfigDict

class MyModel(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,  # strip leading/trailing whitespace from strings
        frozen=True,                # make instances immutable (and hashable)
        extra="forbid",             # reject unknown fields
        strict=True,                # disable type coercion
        populate_by_name=True,      # allow both alias and field name for input
        use_enum_values=True,       # store enum value instead of enum member
    )

    name: str
```

### Key Config Options

| Option | Default | Effect |
|--------|---------|--------|
| `extra="ignore"` | default | Unknown fields silently dropped |
| `extra="forbid"` | — | Unknown fields raise `ValidationError` |
| `extra="allow"` | — | Unknown fields stored on model |
| `frozen=True` | `False` | Instances become immutable |
| `strict=True` | `False` | No type coercion |
| `str_strip_whitespace=True` | `False` | Auto-strip strings |
| `populate_by_name=True` | `False` | Accept both alias and field name |
| `from_attributes=True` | `False` | Parse from ORM objects |

> **Tip:** Use `extra="forbid"` on config models to catch typos in config files at startup rather than silently ignoring them.

---

## Computed Fields

```python
from pydantic import BaseModel, computed_field

class Rectangle(BaseModel):
    width: float
    height: float

    @computed_field
    @property
    def area(self) -> float:
        return self.width * self.height

r = Rectangle(width=3.0, height=4.0)
r.area           # 12.0
r.model_dump()   # includes 'area'
```

---

## Generic Models

```python
from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class Response(BaseModel, Generic[T]):
    data: T
    error: str | None = None
    status: int = 200

class User(BaseModel):
    name: str

resp = Response[User](data={"name": "Jon"})
resp.data.name  # "Jon"
```

Useful for typed API envelope patterns.

---

## Pydantic Dataclasses

A drop-in for `@dataclass` with validation added:

```python
from pydantic.dataclasses import dataclass

@dataclass
class Point:
    x: float
    y: float

Point(x="1.5", y=2)  # coerces "1.5" → 1.5
```

Use over `BaseModel` when you want a plain dataclass interface (no `.model_dump()`, etc.) or are working with code that expects standard dataclasses. Note: Pydantic dataclasses don't support all `BaseModel` features (e.g., `model_validate_json`, serialization config).

---

## Common Patterns

### Config Management

```python
from pydantic_settings import BaseSettings  # separate package: pip install pydantic-settings
from pydantic import ConfigDict, Field

class AppConfig(BaseSettings):
    model_config = ConfigDict(extra="forbid")

    db_host: str = Field(default="localhost")
    db_port: int = Field(default=5432)
    debug: bool = False

    class Config:
        env_prefix = "APP_"  # reads APP_DB_HOST, APP_DB_PORT, etc. from env
```

### Logging Params to MLflow

```python
import mlflow

class RunConfig(BaseModel):
    learning_rate: float = 0.01
    epochs: int = 10
    batch_size: int = 32

config = RunConfig()
mlflow.log_params(config.model_dump())
```

### Alias Mapping (camelCase API → snake_case Python)

```python
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

class ApiResponse(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    user_id: int
    first_name: str

# accepts: {"userId": 1, "firstName": "Jon"}
# serialize with: resp.model_dump(by_alias=True) → {"userId": 1, "firstName": "Jon"}
```

---

## Common Pitfalls

### 1. `Optional[T]` ≠ "field can be omitted"

```python
class Model(BaseModel):
    value: str | None   # required — still must be passed explicitly

Model()             # ValidationError: value is required
Model(value=None)   # OK
```

Fix: add `= None` as default.

### 2. Silent coercion hiding bad data

```python
class Event(BaseModel):
    count: int

Event(count="42")    # OK — "42" coerced to 42
Event(count="42.7")  # OK — coerces to 42, silently truncating!
Event(count="abc")   # raises
```

Use `model_config = ConfigDict(strict=True)` if you need strict input.

### 3. Mutable default values

```python
class Good(BaseModel):
    items: list = Field(default_factory=list)  # idiomatic
```

### 4. Validators run after type coercion

`@field_validator` (the default `mode="after"`) receives the already-coerced value. Use `mode="before"` if you need to inspect the raw input.

### 5. `frozen=True` is not deep immutability

```python
class Container(BaseModel):
    model_config = ConfigDict(frozen=True)
    tags: list[str]

c = Container(tags=["a"])
c.tags = ["b"]      # raises — assignment blocked
c.tags.append("b")  # works — the list itself is still mutable
```

Use `tuple` instead of `list` for true deep immutability.

### 6. Forgetting `@classmethod` on `@field_validator`

```python
# wrong
@field_validator("email")
def validate(cls, v): ...

# correct
@field_validator("email")
@classmethod
def validate(cls, v): ...
```

Pydantic v2 raises `PydanticUserError` if you forget it.

---

## v1 vs v2 Quick Reference

| Task | v1 | v2 |
|------|----|----|
| Parse from dict | `.parse_obj(d)` | `.model_validate(d)` |
| Parse from JSON | `.parse_raw(s)` | `.model_validate_json(s)` |
| Serialize to dict | `.dict()` | `.model_dump()` |
| Serialize to JSON | `.json()` | `.model_dump_json()` |
| JSON schema | `.schema()` | `.model_json_schema()` |
| Copy instance | `.copy()` | `.model_copy()` |
| Field config | `class Config:` | `model_config = ConfigDict(...)` |
| Custom validator | `@validator` | `@field_validator` |
| Model validator | `@root_validator` | `@model_validator` |
| Check field set | `__fields_set__` | `model_fields_set` |
