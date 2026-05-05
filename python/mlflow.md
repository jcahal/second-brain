# MLflow

> Covers the most commonly used features, patterns, and pitfalls. See the [official docs](https://mlflow.org/docs/latest/index.html) for the full API.

---

## Core Concepts

| Concept | Description |
|---|---|
| **Run** | A single execution — logs params, metrics, artifacts |
| **Experiment** | A named group of related runs |
| **Params** | Inputs to a run (hyperparameters) — logged once |
| **Metrics** | Outputs (loss, accuracy) — can be logged at each step |
| **Artifacts** | Files attached to a run (models, plots, CSVs) |
| **Tags** | Free-form metadata key/value pairs |
| **Model Registry** | Versioned store for promoting models through lifecycle stages |

---

## Setup

```bash
pip install mlflow

# launch local UI (stores data in ./mlruns by default)
mlflow ui
# visit http://localhost:5000
```

### Pointing to a remote tracking server

```python
import mlflow

mlflow.set_tracking_uri("http://your-mlflow-server:5000")
mlflow.set_experiment("my-experiment")
```

If `set_experiment` is not called, runs go into the `Default` experiment.

---

## Tracking Runs

### Context manager (recommended)

```python
with mlflow.start_run(run_name="rf-baseline"):
    mlflow.log_param("lr", 0.01)
    mlflow.log_metric("accuracy", 0.94)
    mlflow.log_artifact("confusion_matrix.png")
```

The run closes automatically on block exit — even if an exception is raised.

### Capturing the run ID

```python
with mlflow.start_run() as run:
    model.fit(X_train, y_train)
    run_id = run.info.run_id
```

### Logging

```python
# single param / metric
mlflow.log_param("n_estimators", 100)
mlflow.log_metric("accuracy", 0.94)

# multiple at once
mlflow.log_params({"n_estimators": 100, "max_depth": 5})
mlflow.log_metrics({"accuracy": 0.94, "f1": 0.91})

# metric over time (e.g. per epoch)
for epoch, loss in enumerate(losses):
    mlflow.log_metric("loss", loss, step=epoch)

# artifacts
mlflow.log_artifact("path/to/file.png")
mlflow.log_artifact("path/to/file.csv", artifact_path="data")  # into a subdirectory
```

### Nested runs (e.g. hyperparameter sweeps)

```python
with mlflow.start_run(run_name="sweep"):
    for lr in [0.001, 0.01, 0.1]:
        with mlflow.start_run(run_name=f"lr={lr}", nested=True):
            mlflow.log_param("lr", lr)
            model.fit(X_train, y_train)
            mlflow.log_metric("accuracy", score)
```

---

## Auto-logging

Hooks into supported libraries and automatically logs params, metrics, and the model artifact.

```python
mlflow.autolog()

model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)  # MLflow creates and closes the run automatically
```

### Per-library

```python
mlflow.sklearn.autolog()
mlflow.xgboost.autolog()
mlflow.pytorch.autolog()
```

### Mixing autolog with manual logs

```python
mlflow.autolog()

with mlflow.start_run(run_name="rf-baseline"):
    model.fit(X_train, y_train)
    mlflow.log_metric("test_accuracy", model.score(X_test, y_test))  # add your own on top
```

> **Pitfall:** Autolog names metrics and params using its own conventions. If you later switch to manual logging, the column names in `search_runs` will change — breaking any downstream queries.

---

## Querying Runs Programmatically

### MlflowClient — low-level access

```python
from mlflow.tracking import MlflowClient

client = MlflowClient()

run = client.get_run("your_run_id")
run.info.run_id
run.info.status          # FINISHED, FAILED, RUNNING
run.data.params          # dict — all logged params
run.data.metrics         # dict — last value only per metric
```

### Search runs — returns a DataFrame

```python
runs = mlflow.search_runs(
    experiment_names=["my-experiment"],
    order_by=["start_time DESC"]   # most recent first
)

last_run = runs.iloc[0]
```

### DataFrame column structure

Metrics, params, and tags are flattened into dot-notation columns:

```
run_id               a1b2c3d4...
status               FINISHED
metrics.accuracy     0.94
params.n_estimators  100          ← string, not int
tags.mlflow.runName  rf-baseline
```

> **Pitfall:** All param values are strings. Cast before numeric comparisons: `int(last_run["params.n_estimators"])`

### Filtering and sorting

```python
runs = mlflow.search_runs(
    experiment_names=["my-experiment"],
    filter_string="metrics.accuracy > 0.9 and params.lr = '0.01'"
)

best_run = runs.sort_values("metrics.accuracy", ascending=False).iloc[0]
```

### Resolving experiment name

`experiment_id` in the DataFrame is a numeric ID, not the name:

```python
client.get_experiment(last_run["experiment_id"]).name
```

---

## Model Logging & Loading

### Log a model inside a run

```python
with mlflow.start_run():
    model.fit(X_train, y_train)
    mlflow.sklearn.log_model(model, artifact_path="model")
```

### Load a model by run ID

```python
model = mlflow.sklearn.load_model(f"runs:/{run_id}/model")
```

### Load as a generic Python function (framework-agnostic)

```python
model = mlflow.pyfunc.load_model(f"runs:/{run_id}/model")
model.predict(X_test)
```

---

## Model Registry

### Register a model

```python
mlflow.register_model(f"runs:/{run_id}/model", "MyModelName")

# or at log time
mlflow.sklearn.log_model(model, "model", registered_model_name="MyModelName")
```

### Aliases (MLflow 2.x+, preferred over stages)

```python
client.set_registered_model_alias("MyModelName", "champion", version=3)

# load by alias
model = mlflow.pyfunc.load_model("models:/MyModelName@champion")
```

> **Pitfall:** Model stages (`Staging`, `Production`, `Archived`) are deprecated in MLflow 2.x. Prefer aliases for new projects.

### Load by stage (legacy)

```python
model = mlflow.pyfunc.load_model("models:/MyModelName/Production")
```

---

## Serving Models

```bash
# serve a registered model as a REST API
mlflow models serve -m "models:/MyModelName/Production" --port 5001

# build a Docker image for deployment
mlflow models build-docker -m "models:/MyModelName/Production" -n my-model-image
```

```bash
# request format
curl http://localhost:5001/invocations \
  -H "Content-Type: application/json" \
  -d '{"dataframe_records": [{"feature1": 1.0, "feature2": 2.0}]}'
```

---

## Common Pitfalls

### 1. Forgetting to set an experiment

Runs land in `Default`, making the UI hard to navigate at scale. Always call `mlflow.set_experiment()` at the top of your script.

### 2. Leaving runs open

Using manual `start_run()` / `end_run()` and hitting an exception leaves the run in `RUNNING` state indefinitely. Use the context manager.

### 3. Param values are always strings

`runs.iloc[0]["params.n_estimators"]` returns `"100"`. Cast before using numerically.

### 4. `run.data.metrics` only returns the last value

If you logged a metric at each epoch, `run.data.metrics["loss"]` gives only the final value. Use `client.get_metric_history(run_id, "loss")` to retrieve all steps.

### 5. Autolog naming drift

Autolog uses its own param/metric names. Switching to manual logging or upgrading MLflow can shift column names in `search_runs`, breaking downstream code.

### 6. Local artifact storage doesn't scale

Default artifact storage is `./mlruns` on disk. For team use, configure a remote artifact store (S3, GCS, Azure Blob) alongside a remote tracking server.
