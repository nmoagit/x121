#!/usr/bin/env python3
"""Unit tests for the scene registry in comfyui_generate.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from comfyui_generate import (
    WORKFLOWS, SCENE_TYPES, SCENES, ALL_SCENE_NAMES,
    SCENE_TYPE_TO_SCENES, _expand_scene_tokens, resolve_scenes,
    apply_scene_spec, parse_scene_spec,
)


def test_scene_count():
    assert len(SCENES) == 10, f"Expected 10 scenes, got {len(SCENES)}"


def test_all_expected_scenes_present():
    expected = {
        "bj", "topless_bj", "feet", "topless_feet", "topless_sex",
        "boobs_fondle", "topless_boobs_fondle", "bottom", "topless_bottom",
        "boobs_clothes_off",
    }
    assert set(SCENES.keys()) == expected


def test_scene_fields():
    required = {"scene_type", "workflow_key", "workflow_file", "workflow_display",
                "seed_file", "seed_name", "display", "scene_type_display"}
    for name, s in SCENES.items():
        missing = required - set(s.keys())
        assert not missing, f"{name} missing fields: {missing}"
        assert s["scene_type"] in SCENE_TYPES, f"{name} scene_type {s['scene_type']} not in SCENE_TYPES"
        assert s["workflow_key"] in WORKFLOWS, f"{name} workflow_key {s['workflow_key']} not in WORKFLOWS"


def test_type_expansion_bj():
    assert _expand_scene_tokens(["bj"]) == ["bj", "topless_bj"]


def test_type_expansion_single_derived():
    assert _expand_scene_tokens(["topless_bj"]) == ["topless_bj"]


def test_type_expansion_single_seed_types():
    assert _expand_scene_tokens(["topless_sex"]) == ["topless_sex"]
    assert _expand_scene_tokens(["boobs_clothes_off"]) == ["boobs_clothes_off"]


def test_type_expansion_mixed():
    result = _expand_scene_tokens(["bj", "topless_feet"])
    assert result == ["bj", "topless_bj", "topless_feet"]


def test_type_expansion_no_duplicates():
    result = _expand_scene_tokens(["bj", "bj"])
    assert result == ["bj", "topless_bj"]


def test_type_expansion_unknown_raises():
    try:
        _expand_scene_tokens(["dance"])
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "dance" in str(e)
        assert "Valid scene types" in str(e)


def test_resolve_scenes_type_level():
    scenes = resolve_scenes("bj", None)
    assert "bj" in scenes
    assert "topless_bj" in scenes
    assert len(scenes) == 2


def test_resolve_scenes_derived():
    scenes = resolve_scenes("topless_bj", None)
    assert scenes == ["topless_bj"]


def test_resolve_scenes_all():
    scenes = resolve_scenes(None, None)
    assert len(scenes) == 10


def test_resolve_scenes_exclusion_type_level():
    scenes = resolve_scenes(None, "bj")
    assert "bj" not in scenes
    assert "topless_bj" not in scenes
    assert "feet" in scenes
    assert len(scenes) == 8


def test_resolve_scenes_include_then_exclude():
    scenes = resolve_scenes("bj", "topless_bj")
    assert scenes == ["bj"]


def test_resolve_scenes_multi_type():
    scenes = resolve_scenes("bj,feet", None)
    assert set(scenes) == {"bj", "topless_bj", "feet", "topless_feet"}


def test_resolve_scenes_no_prefix():
    scenes = resolve_scenes("NO bj, NO feet", None)
    assert "bj" not in scenes
    assert "topless_bj" not in scenes
    assert "feet" not in scenes
    assert "topless_feet" not in scenes
    assert len(scenes) == 6


def test_parse_scene_spec():
    inc, exc = parse_scene_spec("bj, feet, bottom")
    assert inc == ["bj", "feet", "bottom"]
    assert exc == []


def test_parse_scene_spec_exclusion():
    inc, exc = parse_scene_spec("NO bj, NO topless_bj")
    assert inc == []
    assert exc == ["bj", "topless_bj"]


def test_apply_scene_spec_type_expansion():
    base = list(ALL_SCENE_NAMES)
    result = apply_scene_spec(["bj"], [], base)
    assert "bj" in result
    assert "topless_bj" in result


def test_apply_scene_spec_exclusion():
    base = list(ALL_SCENE_NAMES)
    result = apply_scene_spec([], ["bj"], base)
    assert "bj" not in result
    assert "topless_bj" not in result
    assert "feet" in result


def test_no_double_topless_prefix():
    for name in SCENES:
        assert not name.startswith("topless_topless_"), f"Double topless prefix: {name}"


def test_display_names():
    assert SCENES["bj"]["display"] == "Clothed BJ"
    assert SCENES["topless_bj"]["display"] == "Topless BJ"
    assert SCENES["topless_sex"]["display"] == "Topless Sex"
    assert SCENES["boobs_clothes_off"]["display"] == "Boobs Clothes Off"
    assert SCENES["topless_bottom"]["display"] == "Topless Bottom"
    assert SCENES["bottom"]["display"] == "Clothed Bottom"


def test_workflow_files_match_old_scene_defs():
    """Verify derived scenes produce the same workflow files as the old SCENE_DEFS."""
    old_mapping = {
        "bj": "bj-api.json",
        "topless_bj": "bj-api.json",
        "feet": "feet-api.json",
        "topless_feet": "feet-api.json",
        "topless_sex": "topless-sex-api.json",
        "boobs_fondle": "boobs-fondle-api.json",
        "topless_boobs_fondle": "boobs-fondle-api.json",
        "bottom": "bottom-api.json",
        "topless_bottom": "topless-bottom-api.json",
        "boobs_clothes_off": "strip-api.json",
    }
    for scene, expected_wf in old_mapping.items():
        assert SCENES[scene]["workflow_file"] == expected_wf, (
            f"{scene}: expected {expected_wf}, got {SCENES[scene]['workflow_file']}"
        )


def test_seed_files_match_old_scene_defs():
    """Verify derived scenes produce the same seed files as the old SCENE_DEFS."""
    old_mapping = {
        "bj": "clothed.png",
        "topless_bj": "topless.png",
        "feet": "clothed.png",
        "topless_feet": "topless.png",
        "topless_sex": "topless.png",
        "boobs_fondle": "clothed.png",
        "topless_boobs_fondle": "topless.png",
        "bottom": "clothed.png",
        "topless_bottom": "topless.png",
        "boobs_clothes_off": "clothed.png",
    }
    for scene, expected_seed in old_mapping.items():
        assert SCENES[scene]["seed_file"] == expected_seed, (
            f"{scene}: expected {expected_seed}, got {SCENES[scene]['seed_file']}"
        )


def test_all_scene_names_matches_scenes_keys():
    assert set(ALL_SCENE_NAMES) == set(SCENES.keys())


def test_scene_type_to_scenes_covers_all():
    all_derived = []
    for scene_names in SCENE_TYPE_TO_SCENES.values():
        all_derived.extend(scene_names)
    assert set(all_derived) == set(SCENES.keys())


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
            print(f"  PASS  {test.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {test.__name__}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
