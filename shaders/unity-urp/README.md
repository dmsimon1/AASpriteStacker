# Unity URP 2D Reference Shader (`AASpriteStack.shader`)

Drop [`AASpriteStack.shader`](AASpriteStack.shader) into your Unity URP project and create a Material using `AASpriteStacker/URP/SpriteStackAA`.

1. Configure your `slices.png` texture importer: **Filter Mode = Point (no filter)**, **Non-Power of Two = None**, **Compression = None**, **sRGB = On** (with Project Color Space = **Linear**).
2. Assign the strip texture to `_MainTex`, set `_Slices` to your layer count, and drive `_AngleRad` from C# on a single Quad mesh.
