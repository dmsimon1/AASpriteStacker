using UnityEngine;

namespace AASpriteStacker.Samples
{
    /// <summary>
    /// Zero-setup Unity URP demo: attach to a Quad with AASpriteStackController + Material("AASpriteStacker/URP/SpriteStackAA"),
    /// assign car_slices.png & cottage_slices.png from Samples~/Demo/Textures, and press Play.
    /// Keys: Space = Swap model, 1/2/4/8 = Live RGSS sample count, A/D = Manual spin.
    /// </summary>
    [RequireComponent(typeof(AASpriteStackController))]
    public class AASpriteStackDemo : MonoBehaviour
    {
        public Texture2D carSlices;
        public Texture2D cottageSlices;

        private AASpriteStackController _ctrl;
        private bool _showingCottage;

        private void Awake()
        {
            _ctrl = GetComponent<AASpriteStackController>();
            if (carSlices != null) _ctrl.SetStrip(carSlices, 20, 0.72f);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.Space))
            {
                _showingCottage = !_showingCottage;
                if (_showingCottage && cottageSlices != null)
                    _ctrl.SetStrip(cottageSlices, 28, 0.76f);
                else if (carSlices != null)
                    _ctrl.SetStrip(carSlices, 20, 0.72f);
            }
            if (Input.GetKeyDown(KeyCode.Alpha1)) _ctrl.samples = 1;
            if (Input.GetKeyDown(KeyCode.Alpha2)) _ctrl.samples = 2;
            if (Input.GetKeyDown(KeyCode.Alpha4)) _ctrl.samples = 4;
            if (Input.GetKeyDown(KeyCode.Alpha8)) _ctrl.samples = 8;
        }
    }
}
