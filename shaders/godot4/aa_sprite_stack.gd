extends Node2D

## Drop-in controller for `aa_sprite_stack.gdshader`.
## Controls:
##   Space       -> Swap Retro Sports Car (20 slices) / Voxel Cottage (28 slices)
##   1 / 2 / 4 / 8 -> Switch RGSS anti-aliasing sample count live
##   A / D (or Left / Right) -> Scrub rotation angle manually
##   P           -> Pause / resume turntable rotation

@export var spin_speed: float = 0.65
@export var display_scale: float = 7.0

var _angle: float = 0.6
var _paused: bool = false
var _samples: int = 4
var _preset_idx: int = 0

var _presets: Array[Dictionary] = [
	{
		"name": "Retro Sports Car (24x44x20)",
		"path": "res://assets/car_slices.png",
		"slices": 20,
		"squash": 0.72,
		"spacing": 1.0,
	},
	{
		"name": "Voxel Cottage (24x24x28)",
		"path": "res://assets/cottage_slices.png",
		"slices": 28,
		"squash": 0.76,
		"spacing": 1.0,
	},
]

@onready var _stack_rect: ColorRect = $StackRect
@onready var _hud_label: Label = $CanvasLayer/HudLabel

func _ready() -> void:
	_apply_preset(0)
	_sync_shader()

func _apply_preset(idx: int) -> void:
	_preset_idx = idx % _presets.size()
	var p: Dictionary = _presets[_preset_idx]
	var mat := _stack_rect.material as ShaderMaterial
	if mat == null:
		return
	var tex := load(p["path"]) as Texture2D
	if tex != null:
		mat.set_shader_parameter("sheet", tex)
	mat.set_shader_parameter("slices", int(p["slices"]))
	mat.set_shader_parameter("squash", float(p["squash"]))
	mat.set_shader_parameter("spacing", float(p["spacing"]))
	mat.set_shader_parameter("display_scale", display_scale)
	_update_hud()

func _sync_shader() -> void:
	var mat := _stack_rect.material as ShaderMaterial
	if mat == null:
		return
	mat.set_shader_parameter("angle_rad", _angle)
	mat.set_shader_parameter("samples", _samples)

func _update_hud() -> void:
	var p: Dictionary = _presets[_preset_idx]
	var mode_str := "1x Legacy (No AA)" if _samples == 1 else "%dx RGSS AA" % _samples
	_hud_label.text = (
		"AASpriteStacker · Godot 4 Single-Quad DDA\n"
		+ "Model: %s  |  AA: %s  |  Draw Calls: 1\n" % [p["name"], mode_str]
		+ "[Space] Swap Model   [1/2/4/8] RGSS Samples   [A/D] Rotate   [P] Pause"
	)

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_SPACE:
			_apply_preset(_preset_idx + 1)
		KEY_P:
			_paused = not _paused
		KEY_1:
			_samples = 1
			_update_hud()
		KEY_2:
			_samples = 2
			_update_hud()
		KEY_4:
			_samples = 4
			_update_hud()
		KEY_8:
			_samples = 8
			_update_hud()

func _process(delta: float) -> void:
	var manual := 0.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		manual -= 1.6
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		manual += 1.6
	if manual != 0.0:
		_angle += manual * delta
	elif not _paused:
		_angle += spin_speed * delta
	_sync_shader()
