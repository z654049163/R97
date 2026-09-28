#!/usr/bin/env python3
"""Evaluate probe-ordering strategies without granting them decision authority."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


CAPABILITY_WEIGHTS = {
    "native_bridge": 2.4,
    "network": 2.2,
    "payment": 2.5,
    "storage": 1.8,
    "visible_ui": 1.7,
    "crypto": 1.5,
    "module_runtime": 1.5,
    "timing": 1.3,
    "unknown": 1.1,
}

TRANSFORMATION_WEIGHTS = {
    "CALL_EVAL": 1.3,
    "BRANCH_PRUNE": 1.2,
    "DEAD_CODE_DELETE": 1.1,
    "CONST_EVAL": 1.0,
}

CAPABILITY_COLUMNS = [
    "native_bridge",
    "network",
    "payment",
    "storage",
    "visible_ui",
    "crypto",
    "module_runtime",
    "timing",
    "unknown",
]

TRANSFORMATION_COLUMNS = [
    "CALL_EVAL",
    "BRANCH_PRUNE",
    "DEAD_CODE_DELETE",
    "CONST_EVAL",
]

MODEL_COLUMNS = [
    "log_occurrences",
    "project_count",
    "unresolved_ratio",
    "root_length",
    "path_depth",
    "callability_transformation_ratio",
    "is_node_root",
    "is_browser_root",
    "is_wechat_root",
    *[f"capability_{name}" for name in CAPABILITY_COLUMNS],
    *[f"transformation_{name}" for name in TRANSFORMATION_COLUMNS],
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--features",
        type=Path,
        default=Path("datasets/feature-ablation/ranking-features.json"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("datasets/feature-ablation"),
    )
    parser.add_argument("--random-seed", type=int, default=97)
    return parser.parse_args()


def load_entities(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entities = payload.get("entities")
    if not isinstance(entities, list) or not entities:
        raise ValueError(f"No ranking entities found in {path}")
    return entities


def vectorize(entity: dict) -> dict[str, float]:
    capability_domains = set(entity.get("capabilityDomains", []))
    transformation_kinds = set(entity.get("transformationKinds", []))
    row = {
        "log_occurrences": math.log2(1 + entity["occurrences"]),
        "project_count": float(entity["projectCount"]),
        "unresolved_ratio": float(entity["unresolvedRatio"]),
        "root_length": float(entity["rootLength"]),
        "path_depth": float(entity["pathDepth"]),
        "callability_transformation_ratio": float(
            entity["callabilityTransformationRatio"]
        ),
        "is_node_root": float(entity["isNodeRoot"]),
        "is_browser_root": float(entity["isBrowserRoot"]),
        "is_wechat_root": float(entity["isWechatRoot"]),
    }
    for name in CAPABILITY_COLUMNS:
        row[f"capability_{name}"] = float(name in capability_domains)
    for name in TRANSFORMATION_COLUMNS:
        row[f"transformation_{name}"] = float(name in transformation_kinds)
    return row


def fixed_formula_score(row: dict[str, float], entity: dict) -> float:
    capability_weight = max(
        [
            CAPABILITY_WEIGHTS.get(name, 1.0)
            for name in entity.get("capabilityDomains", [])
        ]
        or [1.0]
    )
    transformation_weight = max(
        [
            TRANSFORMATION_WEIGHTS.get(name, 1.0)
            for name in entity.get("transformationKinds", [])
        ]
        or [1.0]
    )
    return (
        row["log_occurrences"]
        * (1 + math.log2(1 + row["project_count"]))
        * (1 + 0.5 * row["unresolved_ratio"])
        * capability_weight
        * transformation_weight
    )


def evaluate_scores(labels: np.ndarray, scores: np.ndarray) -> dict:
    order = np.argsort(-scores, kind="stable")
    sorted_labels = labels[order]
    positive_count = int(labels.sum())
    budget_metrics = {}
    for budget in (10, 20, 50, 100, 200):
        if budget > len(labels):
            continue
        found = int(sorted_labels[:budget].sum())
        budget_metrics[f"recall_at_{budget}"] = (
            found / positive_count if positive_count else None
        )
        budget_metrics[f"precision_at_{budget}"] = found / budget

    positive_positions = np.flatnonzero(sorted_labels) + 1
    has_both_classes = len(np.unique(labels)) == 2
    return {
        "positive_count": positive_count,
        "roc_auc": (
            float(roc_auc_score(labels, scores)) if has_both_classes else None
        ),
        "average_precision": (
            float(average_precision_score(labels, scores))
            if has_both_classes
            else None
        ),
        "first_positive_rank": (
            int(positive_positions[0]) if len(positive_positions) else None
        ),
        "rank_capture": {
            "50_percent": first_rank_for_fraction(
                sorted_labels, positive_count, 0.5
            ),
            "80_percent": first_rank_for_fraction(
                sorted_labels, positive_count, 0.8
            ),
            "100_percent": first_rank_for_fraction(
                sorted_labels, positive_count, 1.0
            ),
        },
        **budget_metrics,
    }


def first_rank_for_fraction(
    sorted_labels: np.ndarray, positive_count: int, fraction: float
) -> int | None:
    if positive_count == 0:
        return None
    needed = max(1, math.ceil(positive_count * fraction))
    cumulative = np.cumsum(sorted_labels)
    positions = np.flatnonzero(cumulative >= needed)
    return int(positions[0] + 1) if len(positions) else None


def out_of_fold_scores(
    matrix: np.ndarray,
    labels: np.ndarray,
    groups: np.ndarray,
    model_name: str,
    random_seed: int,
) -> np.ndarray:
    scores = np.zeros(len(labels), dtype=float)
    splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=random_seed)
    for train_index, test_index in splitter.split(matrix, labels, groups):
        if model_name == "logistic_regression":
            model = make_pipeline(
                StandardScaler(),
                LogisticRegression(
                    class_weight="balanced",
                    max_iter=2000,
                    random_state=random_seed,
                ),
            )
        elif model_name == "random_forest":
            model = RandomForestClassifier(
                n_estimators=300,
                min_samples_leaf=2,
                class_weight="balanced_subsample",
                random_state=random_seed,
                n_jobs=-1,
            )
        else:
            raise ValueError(f"Unknown model: {model_name}")
        model.fit(matrix[train_index], labels[train_index])
        scores[test_index] = model.predict_proba(matrix[test_index])[:, 1]
    return scores


def repeated_group_cv(
    matrix: np.ndarray,
    labels: np.ndarray,
    groups: np.ndarray,
    model_name: str,
    seeds: tuple[int, ...],
) -> dict[str, float | list[dict]]:
    fold_metrics: list[dict] = []
    for seed in seeds:
        splitter = StratifiedGroupKFold(
            n_splits=5,
            shuffle=True,
            random_state=seed,
        )
        for train_index, test_index in splitter.split(matrix, labels, groups):
            if model_name == "logistic_regression":
                model = make_pipeline(
                    StandardScaler(),
                    LogisticRegression(
                        class_weight="balanced",
                        max_iter=2000,
                        random_state=seed,
                    ),
                )
            elif model_name == "random_forest":
                model = RandomForestClassifier(
                    n_estimators=300,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    random_state=seed,
                    n_jobs=-1,
                )
            else:
                raise ValueError(f"Unknown model: {model_name}")
            model.fit(matrix[train_index], labels[train_index])
            scores = model.predict_proba(matrix[test_index])[:, 1]
            fold_metrics.append(
                evaluate_scores(labels[test_index], scores)
            )

    return {
        "seeds": list(seeds),
        "fold_count": len(fold_metrics),
        "metrics": summarize_fold_metrics(fold_metrics),
        "folds": fold_metrics,
    }


def summarize_fold_metrics(fold_metrics: list[dict]) -> dict:
    metric_names = [
        "roc_auc",
        "average_precision",
        "first_positive_rank",
        "recall_at_10",
        "recall_at_20",
        "recall_at_50",
        "recall_at_100",
        "recall_at_200",
    ]
    summary = {}
    for name in metric_names:
        values = [
            float(metric[name])
            for metric in fold_metrics
            if metric.get(name) is not None
        ]
        if values:
            summary[name] = {
                "mean": float(np.mean(values)),
                "std": float(np.std(values, ddof=1)) if len(values) > 1 else 0.0,
                "median": float(np.median(values)),
                "n": len(values),
            }
        else:
            summary[name] = {
                "mean": None,
                "std": None,
                "median": None,
                "n": 0,
            }
    return summary


def main() -> None:
    args = parse_args()
    entities = load_entities(args.features)
    labels = np.asarray([int(entity["label"]) for entity in entities], dtype=int)
    groups = np.asarray(
        [entity["entityId"].split(".")[0] for entity in entities], dtype=object
    )
    rows = [vectorize(entity) for entity in entities]
    matrix = np.asarray(
        [[row[column] for column in MODEL_COLUMNS] for row in rows], dtype=float
    )

    rng = np.random.default_rng(args.random_seed)
    scores_by_strategy = {
        "random": rng.random(len(entities)),
        "frequency": np.asarray([entity["occurrences"] for entity in entities]),
        "project_spread": np.asarray(
            [entity["projectCount"] for entity in entities]
        ),
        "fixed_formula": np.asarray(
            [
                fixed_formula_score(row, entity)
                for row, entity in zip(rows, entities, strict=True)
            ]
        ),
        "known_host_root": np.asarray(
            [
                row["is_node_root"]
                + row["is_browser_root"]
                + row["is_wechat_root"]
                for row in rows
            ]
        ),
        "logistic_regression": out_of_fold_scores(
            matrix, labels, groups, "logistic_regression", args.random_seed
        ),
        "random_forest": out_of_fold_scores(
            matrix, labels, groups, "random_forest", args.random_seed
        ),
        "oracle": labels.astype(float),
    }

    results = {
        name: evaluate_scores(labels, scores)
        for name, scores in scores_by_strategy.items()
    }
    cross_validation = {
        "logistic_regression": repeated_group_cv(
            matrix,
            labels,
            groups,
            "logistic_regression",
            (args.random_seed, 17, 31),
        ),
        "random_forest": repeated_group_cv(
            matrix,
            labels,
            groups,
            "random_forest",
            (args.random_seed, 17, 31),
        ),
    }
    ranking = [
        {
            "entityId": entity["entityId"],
            "label": int(label),
            "fixedFormulaScore": float(scores_by_strategy["fixed_formula"][index]),
            "logisticScore": float(scores_by_strategy["logistic_regression"][index]),
            "randomForestScore": float(scores_by_strategy["random_forest"][index]),
        }
        for index, (entity, label) in enumerate(
            zip(entities, labels, strict=True)
        )
    ]
    ranking.sort(key=lambda item: item["fixedFormulaScore"], reverse=True)

    output = {
        "generatedAt": "deterministic-run",
        "featureFile": str(args.features),
        "entityCount": len(entities),
        "positiveCount": int(labels.sum()),
        "modelColumns": MODEL_COLUMNS,
        "evaluationProtocol": {
            "logistic_regression": "5-fold StratifiedGroupKFold，按根符号分组，OOF 预测",
            "random_forest": "5-fold StratifiedGroupKFold，按根符号分组，OOF 预测",
            "nonML": "在全部实体上直接排序",
        },
        "results": results,
        "crossValidation": cross_validation,
        "ranking": ranking,
    }

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "priority-models.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (args.out / "priority-models.md").write_text(
        render_markdown(output),
        encoding="utf-8",
    )
    print(json.dumps(results, ensure_ascii=False, indent=2))


def render_markdown(output: dict) -> str:
    lines = [
        "# R97 有限预算探针排序实验",
        "",
        f"实体数：{output['entityCount']}，真实跨宿主差异实体：{output['positiveCount']}",
        "",
        "> 排序器只决定先探测谁，不产生 FOLD 权限。ML 结果使用按根符号分组的 5 折 OOF 预测。",
        "",
        "| 策略 | AP | ROC-AUC | Recall@20 | Recall@50 | Recall@100 | 首次命中排名 | 找到 80% 差异实体所需排名 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, result in output["results"].items():
        lines.append(
            "| {name} | {ap} | {auc} | {r20} | {r50} | {r100} | {first} | {r80} |".format(
                name=name,
                ap=percent(result.get("average_precision")),
                auc=percent(result.get("roc_auc")),
                r20=percent(result.get("recall_at_20")),
                r50=percent(result.get("recall_at_50")),
                r100=percent(result.get("recall_at_100")),
                first=result.get("first_positive_rank"),
                r80=result.get("rank_capture", {}).get("80_percent"),
            )
        )
    if "crossValidation" in output:
        lines.extend(
            [
                "",
                "## 按根符号分组重复交叉验证",
                "",
                "| 模型 | AP mean±std | ROC-AUC mean±std | Recall@50 mean±std | Recall@100 mean±std |",
                "|---|---:|---:|---:|---:|",
            ]
        )
        for name, cv in output["crossValidation"].items():
            metrics = cv["metrics"]
            lines.append(
                "| {name} | {ap} | {auc} | {r50} | {r100} |".format(
                    name=name,
                    ap=mean_std(metrics["average_precision"]),
                    auc=mean_std(metrics["roc_auc"]),
                    r50=mean_std(metrics["recall_at_50"]),
                    r100=mean_std(metrics["recall_at_100"]),
                )
            )
    lines.extend(
        [
            "",
            "## 结论规则",
            "",
            "- 若 ML 相比固定公式没有稳定提高 AP 与 Recall@K，则不进入论文主线。",
            "- 若任何排序都无法在有限预算内找到全部差异实体，则排序只能优化工程成本，不能替代全量运行时证据。",
            "- 安全结论仍由证据完整性决定，排序分数不得进入 `FOLD` 判定。",
            "",
        ]
    )
    return "\n".join(lines)


def percent(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.2f}%"


def mean_std(value: dict) -> str:
    if value["mean"] is None:
        return "n/a"
    return f"{value['mean'] * 100:.2f}% ± {value['std'] * 100:.2f}%"


if __name__ == "__main__":
    main()
