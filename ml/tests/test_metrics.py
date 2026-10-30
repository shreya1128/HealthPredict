from evaluation.metrics import compute_metrics


def test_compute_metrics_against_hand_calculated_values():
    # 4 true negatives, 1 false positive, 2 false negatives, 3 true positives (n=10)
    y_true = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    y_pred = [0, 0, 0, 0, 1, 0, 0, 1, 1, 1]
    y_proba = [0.1, 0.2, 0.3, 0.4, 0.6, 0.3, 0.4, 0.7, 0.8, 0.9]

    m = compute_metrics(y_true, y_pred, y_proba)
    cm = m["confusion_matrix"]
    assert cm == {"true_negative": 4, "false_positive": 1, "false_negative": 2, "true_positive": 3}
    assert m["accuracy"] == 0.7                    # 7/10 correct
    assert m["precision"] == 0.75                  # 3 / (3+1)
    assert m["recall"] == 0.6                      # 3 / (3+2)
    assert m["f1_score"] == round(2 * 0.75 * 0.6 / (0.75 + 0.6), 4)


def test_perfect_predictions():
    y_true = [0, 0, 1, 1]
    m = compute_metrics(y_true, y_true, [0.0, 0.1, 0.9, 1.0])
    assert m["accuracy"] == m["precision"] == m["recall"] == m["f1_score"] == m["roc_auc"] == 1.0
