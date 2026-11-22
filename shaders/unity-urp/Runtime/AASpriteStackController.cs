using UnityEngine;

namespace AASpriteStacker
{
    /// <summary>
    /// Drop-in URP controller for AASpriteStacker/URP/SpriteStackAA.
    /// Uses MaterialPropertyBlock so hundreds of stacked sprites share one Material with zero leaks.
    /// </summary>
    [ExecuteAlways]
    [RequireComponent(typeof(Renderer))]
    public class AASpriteStackController : MonoBehaviour
    {
        [Header("Slice Strip Asset")]
        public Texture2D sliceStrip;
        [Min(1)] public int slices = 20;

        [Header("Projection & Rotation")]
        public float angleRad = 0.6f;
        public float autoSpinRadPerSec = 0.65f;
        [Range(0.4f, 1.0f)] public float squash = 0.72f;
        [Range(0.5f, 2.5f)] public float spacing = 1.0f;
        [Range(1.0f, 16.0f)] public float displayScale = 6.0f;

        [Header("Anti-Aliasing & Sun")]
        [Range(1, 8)] public int samples = 4;
        public Vector3 sunDirection = new Vector3(0.45f, 0.40f, 0.80f);

        private Renderer _renderer;
        private MaterialPropertyBlock _mpb;

        private static readonly int MainTexId = Shader.PropertyToID("_MainTex");
        private static readonly int SlicesId = Shader.PropertyToID("_Slices");
        private static readonly int AngleRadId = Shader.PropertyToID("_AngleRad");
        private static readonly int SquashId = Shader.PropertyToID("_Squash");
        private static readonly int SpacingId = Shader.PropertyToID("_Spacing");
        private static readonly int DisplayScaleId = Shader.PropertyToID("_DisplayScale");
        private static readonly int SamplesId = Shader.PropertyToID("_Samples");
        private static readonly int SunDirId = Shader.PropertyToID("_SunDir");

        private void OnEnable()
        {
            _renderer = GetComponent<Renderer>();
            if (_mpb == null) _mpb = new MaterialPropertyBlock();
            ApplyProperties();
        }

        private void Update()
        {
            if (Application.isPlaying && Mathf.Abs(autoSpinRadPerSec) > 1e-4f)
            {
                angleRad += autoSpinRadPerSec * Time.deltaTime;
            }
            ApplyProperties();
        }

        public void SetStrip(Texture2D strip, int sliceCount, float verticalSquash = 0.75f)
        {
            sliceStrip = strip;
            slices = Mathf.Max(1, sliceCount);
            squash = verticalSquash;
            ApplyProperties();
        }

        public void ApplyProperties()
        {
            if (_renderer == null) _renderer = GetComponent<Renderer>();
            if (_mpb == null) _mpb = new MaterialPropertyBlock();
            _renderer.GetPropertyBlock(_mpb);
            if (sliceStrip != null) _mpb.SetTexture(MainTexId, sliceStrip);
            _mpb.SetInt(SlicesId, Mathf.Max(1, slices));
            _mpb.SetFloat(AngleRadId, angleRad);
            _mpb.SetFloat(SquashId, squash);
            _mpb.SetFloat(SpacingId, spacing);
            _mpb.SetFloat(DisplayScaleId, displayScale);
            _mpb.SetInt(SamplesId, samples);
            _mpb.SetVector(SunDirId, new Vector4(sunDirection.x, sunDirection.y, sunDirection.z, 0f));
            _renderer.SetPropertyBlock(_mpb);
        }
    }
}
