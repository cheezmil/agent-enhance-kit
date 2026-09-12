from scaffold.python.attribution import classify_failures


def test_classify_failures_marks_missing_skill_without_invocation_as_harness():
    failures = classify_failures(
        ["Required skill not invoked: comet"],
        {"skills_invoked": []},
        "generic",
    )

    assert failures == [
        {
            "bucket": "harness",
            "check": "Required skill not invoked: comet",
            "reason": "target Skill was never invoked, so workflow quality is not observable",
        }
    ]


def test_classify_failures_marks_state_failures_as_workflow():
    failures = classify_failures(
        ["Expected .comet.yaml state transition to advance"],
        {"skills_invoked": ["comet"]},
        "comet-workflow",
    )

    assert failures[0]["bucket"] == "workflow"
    assert "state or guard" in failures[0]["reason"]


def test_classify_failures_marks_validator_path_issues_as_task():
    failures = classify_failures(
        ["validator artifact path not found in archive"],
        {"skills_invoked": ["comet"]},
        "authoring-skill",
    )

    assert failures[0]["bucket"] == "task"


def test_classify_failures_defaults_to_model_when_workflow_observable():
    failures = classify_failures(
        ["Expected package to contain summary section"],
        {"skills_invoked": ["comet-any"]},
        "authoring-skill",
    )

    assert failures[0]["bucket"] == "model"
