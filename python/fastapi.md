# FastAPI

> A practical reference for the most commonly used features, patterns, and pitfalls. See the [official docs](https://fastapi.tiangolo.com/) for deep dives.

---

## Setup & Running

```bash
pip install fastapi uvicorn[standard]
```

```bash
# development — auto-reload on file changes
uvicorn main:app --reload

# production — multiple workers
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Auto-generated docs** (available by default):
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

---

## Path & Query Parameters

### Path Parameters

```python
@app.get("/users/{user_id}")
def get_user(user_id: int):  # FastAPI validates and coerces the type
    return {"user_id": user_id}
```

### Query Parameters

```python
@app.get("/items/")
def list_items(skip: int = 0, limit: int = 10, search: str | None = None):
    return {"skip": skip, "limit": limit, "search": search}
# GET /items/?skip=20&limit=5&search=hat
```

### How FastAPI decides where a parameter comes from

| Location | Rule |
|---|---|
| Path parameter | Named in the route string: `/items/{item_id}` |
| Query parameter | Function param with no match in the route string |
| Body | Function param typed as a Pydantic `BaseModel` |

### Validation with `Path()` / `Query()`

```python
from fastapi import Path, Query

@app.get("/items/{item_id}")
def get_item(
    item_id: int = Path(ge=1),
    q: str = Query(min_length=3, max_length=50, default=None),
):
    ...
```

---

## Request Bodies

### Basic Body

```python
from pydantic import BaseModel

class Item(BaseModel):
    name: str
    price: float
    in_stock: bool = True

@app.post("/items/")
def create_item(item: Item):
    return item
```

FastAPI reads the body as JSON, validates it against the model, and passes a typed `Item` instance.

### Mixed: Body + Path + Query

```python
@app.put("/items/{item_id}")
def update_item(item_id: int, item: Item, notify: bool = False):
    return {"item_id": item_id, "item": item, "notify": notify}
```

FastAPI resolves which parameter comes from where automatically.

### `Field()` for per-field validation

```python
from pydantic import BaseModel, Field

class Item(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: float = Field(gt=0, description="Must be positive")
```

---

## Response Models

### Controlling Output Shape

```python
class ItemOut(BaseModel):
    name: str
    price: float
    # no internal fields like db_id or password_hash

@app.get("/items/{item_id}", response_model=ItemOut)
def get_item(item_id: int):
    return {"name": "Widget", "price": 9.99, "internal_field": "hidden"}
    # internal_field is stripped from the response
```

### Exclude None Values

```python
@app.get("/items/{item_id}", response_model=ItemOut, response_model_exclude_none=True)
def get_item(item_id: int): ...
```

### List Responses

```python
@app.get("/items/", response_model=list[ItemOut])
def list_items(): ...
```

---

## Status Codes & Error Handling

### Setting Response Status

```python
from fastapi import status

@app.post("/items/", status_code=status.HTTP_201_CREATED)
def create_item(item: Item): ...
```

### Raising HTTP Errors

```python
from fastapi import HTTPException

@app.get("/items/{item_id}")
def get_item(item_id: int):
    if item_id not in db:
        raise HTTPException(status_code=404, detail="Item not found")
    return db[item_id]
```

### Custom Exception Handlers

```python
from fastapi import Request
from fastapi.responses import JSONResponse

class ItemNotFoundError(Exception):
    def __init__(self, item_id: int):
        self.item_id = item_id

@app.exception_handler(ItemNotFoundError)
async def item_not_found_handler(request: Request, exc: ItemNotFoundError):
    return JSONResponse(
        status_code=404,
        content={"message": f"Item {exc.item_id} does not exist"},
    )
```

### Validation Error Shape

When FastAPI rejects a request (bad type, missing field), it returns `422 Unprocessable Entity`:

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "price"],
      "msg": "Field required"
    }
  ]
}
```

---

## Dependency Injection

The most underused and most powerful feature in FastAPI.

### Basic Dependency

```python
from fastapi import Depends

def get_db():
    db = connect()
    try:
        yield db    # yield makes this a context manager
    finally:
        db.close()

@app.get("/users/")
def list_users(db=Depends(get_db)):
    return db.query(...)
```

### Shared Auth Dependency

```python
from fastapi import Depends, HTTPException, Header

def require_auth(x_api_key: str = Header()):
    if x_api_key != "secret":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return x_api_key

# dependencies=[...] runs the dep without injecting its return value
@app.get("/protected/", dependencies=[Depends(require_auth)])
def protected_route():
    return {"data": "secret"}
```

### Router-Level Dependencies

```python
router = APIRouter(dependencies=[Depends(require_auth)])
# all routes on this router require auth
```

### Chained Dependencies

```python
def get_current_user(db=Depends(get_db), token: str = Header()):
    return db.get_user_by_token(token)

@app.get("/me/")
def me(user=Depends(get_current_user)):
    return user
```

---

## Routers & App Structure

### Defining a Router

```python
# routers/items.py
from fastapi import APIRouter

router = APIRouter(prefix="/items", tags=["items"])

@router.get("/")
def list_items(): ...

@router.post("/")
def create_item(): ...
```

### Mounting in Main App

```python
# main.py
from fastapi import FastAPI
from routers import items, users

app = FastAPI()
app.include_router(items.router)
app.include_router(users.router)
```

### Recommended Project Structure

```
app/
├── main.py
├── dependencies.py       # shared Depends functions
├── models.py             # Pydantic models (or split per domain)
├── routers/
│   ├── items.py
│   └── users.py
└── services/             # business logic, not FastAPI-specific
    └── item_service.py
```

---

## Middleware

### Adding Middleware

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://myapp.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Custom Middleware

```python
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
import time

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        response.headers["X-Process-Time"] = str(time.time() - start)
        return response

app.add_middleware(TimingMiddleware)
```

### Middleware vs Dependency

| Use | When |
|---|---|
| Middleware | Cross-cutting concerns on all/most routes (CORS, logging, timing) |
| Dependency | Route-specific logic, conditional auth, DB sessions |

---

## Background Tasks

Run work after the response is sent — useful for emails, audit logging, etc.

```python
from fastapi import BackgroundTasks

def send_email(address: str, message: str):
    ...  # slow operation, runs after response is returned

@app.post("/notify/")
def notify(background_tasks: BackgroundTasks, email: str):
    background_tasks.add_task(send_email, email, "You've been notified")
    return {"status": "queued"}
```

> **Note:** Background tasks run in the same process. For heavy or distributed work, use a proper task queue (Celery, ARQ, etc.).

---

## Async vs Sync

```python
# use async def when your function awaits something (DB, HTTP, file I/O)
@app.get("/data/")
async def get_data():
    result = await some_async_db_call()
    return result

# use def when your function is CPU-bound or uses sync libraries
@app.get("/compute/")
def compute():
    return heavy_cpu_work()
```

FastAPI runs `def` functions in a thread pool automatically — they don't block the event loop.

**What goes wrong:** `async def` + a blocking library (e.g., `psycopg2`, `requests`) blocks the entire event loop. Use async-native libraries (`asyncpg`, `httpx`) or offload:

```python
import asyncio

@app.get("/blocking/")
async def safe_blocking():
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, some_blocking_function)
    return result
```

---

## Common Pitfalls

### ❌ Route Order Matters

```python
# bad — /items/featured is never reached
@app.get("/items/{item_id}")
def get_item(item_id: str): ...

@app.get("/items/featured")   # shadowed by the route above
def featured(): ...

# good — specific routes before parameterized ones
@app.get("/items/featured")
def featured(): ...

@app.get("/items/{item_id}")
def get_item(item_id: str): ...
```

### ❌ `async def` with Blocking Libraries

See [Async vs Sync](#async-vs-sync) above. Silently destroys performance under load.

### ❌ Returning Raw Dicts Without a `response_model`

FastAPI won't validate or filter your output, so internal fields can leak.

### ❌ Missing `status_code` on POST/DELETE

`POST` should return `201`, `DELETE` often `204`. FastAPI defaults everything to `200`.

### ❌ Lifespan Events — Old Pattern

```python
# deprecated
@app.on_event("startup")
async def startup(): ...

# correct — use the lifespan context manager
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    connect_db()    # startup
    yield
    disconnect_db() # shutdown

app = FastAPI(lifespan=lifespan)
```

---

## Pydantic v2 in FastAPI

FastAPI v0.100+ uses Pydantic v2. Key differences from v1:

| Task | v1 | v2 |
|------|----|----|
| ORM mode config | `class Config: orm_mode = True` | `model_config = ConfigDict(from_attributes=True)` |
| Custom validator | `@validator` | `@field_validator` |
| Serialize to dict | `.dict()` | `.model_dump()` |
| Serialize to JSON | `.json()` | `.model_dump_json()` |
| JSON schema | `.schema()` | `model_json_schema()` |

### ORM Mode (reading from DB objects)

```python
from pydantic import BaseModel, ConfigDict

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str

user_orm = db.query(User).first()
UserOut.model_validate(user_orm)  # reads attributes off the ORM object
```
