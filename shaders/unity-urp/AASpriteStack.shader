// AASpriteStacker — Unity URP 2D Reference Shader
// Single-quad 4x RGSS Orthographic 3D Voxel DDA over a standard horizontal `slices.png` strip.
// Set _MainTex Import Settings: Filter Mode = Point (no filter), Non-Power of Two = None, sRGB = On.
Shader "AASpriteStacker/URP/SpriteStackAA"
{
    Properties
    {
        _MainTex ("Slice Strip (Horizontal PNG)", 2D) = "white" {}
        _Slices ("Slice Count", Int) = 36
        _AngleRad ("Rotation Angle (Radians)", Float) = 0.6
        _Squash ("Vertical Squash (0.4..1.0)", Range(0.4, 1.0)) = 0.75
        _Spacing ("Layer Spacing", Range(0.5, 2.5)) = 1.0
        _DisplayScale ("Display Pixel Scale", Float) = 6.0
        _SunDir ("Sun Direction", Vector) = (0.45, 0.40, 0.80, 0)
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" }
        Blend SrcAlpha OneMinusSrcAlpha
        Cull Off
        ZWrite Off

        Pass
        {
            Name "AASpriteStackForward"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_MainTex);
            float4 _MainTex_TexelSize;

            CBUFFER_START(UnityPerMaterial)
                int _Slices;
                float _AngleRad;
                float _Squash;
                float _Spacing;
                float _DisplayScale;
                float4 _SunDir;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionHCS : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            static const float2 RGSS4[4] = {
                float2(-0.375, -0.125),
                float2( 0.125, -0.375),
                float2( 0.375,  0.125),
                float2(-0.125,  0.375)
            };

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                OUT.positionHCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.uv = IN.uv;
                return OUT;
            }

            float4 FetchVoxel(int3 cell, int2 sliceSize)
            {
                int2 tc = int2(cell.z * sliceSize.x + cell.x, sliceSize.y - 1 - cell.y);
                return _MainTex.Load(int3(tc, 0));
            }

            float4 TraceStackRay(float2 artCoord, int3 vol, float ca, float sa, float3 objLight)
            {
                float invSq = 1.0 / max(_Squash, 0.1);
                float3 bmax = float3(vol);
                float v0 = (artCoord.y + bmax.z * _Spacing) * invSq;
                float3 ro = float3(
                    bmax.x * 0.5 + artCoord.x * ca + v0 * sa,
                    bmax.y * 0.5 - artCoord.x * sa + v0 * ca,
                    bmax.z
                );
                float3 rd = float3(-_Spacing * sa, -_Spacing * ca, -_Squash);
                float3 invD = float3(
                    abs(rd.x) > 1e-6 ? 1.0 / rd.x : 1e20,
                    abs(rd.y) > 1e-6 ? 1.0 / rd.y : 1e20,
                    abs(rd.z) > 1e-6 ? 1.0 / rd.z : 1e20
                );

                float3 t0 = (float3(0.0, 0.0, 0.0) - ro) * invD;
                float3 t1 = (bmax - ro) * invD;
                float3 tmin = min(t0, t1);
                float3 tmax = max(t0, t1);
                float tEnter = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
                float tExit = min(min(tmax.x, tmax.y), tmax.z);
                if (tExit <= tEnter + 1e-4) return float4(0.0, 0.0, 0.0, 0.0);

                float3 pos = ro + rd * (tEnter + 1e-4);
                int3 cell = clamp(int3(floor(pos)), int3(0, 0, 0), vol - 1);
                int3 stepDir = int3(
                    abs(rd.x) > 1e-6 ? (rd.x > 0.0 ? 1 : -1) : 0,
                    abs(rd.y) > 1e-6 ? (rd.y > 0.0 ? 1 : -1) : 0,
                    abs(rd.z) > 1e-6 ? (rd.z > 0.0 ? 1 : -1) : 0
                );
                float3 tDelta = abs(invD);
                float3 nextB = float3(cell) + max(float3(stepDir), float3(0.0, 0.0, 0.0));
                float3 tMax = (nextB - pos) * invD;
                if (stepDir.x == 0) tMax.x = 1e20;
                if (stepDir.y == 0) tMax.y = 1e20;
                if (stepDir.z == 0) tMax.z = 1e20;

                float3 faceN = float3(0.0, 0.0, 1.0);
                if (tmin.x >= tmin.y && tmin.x >= tmin.z) faceN = float3(-float(stepDir.x), 0.0, 0.0);
                else if (tmin.y >= tmin.x && tmin.y >= tmin.z) faceN = float3(0.0, -float(stepDir.y), 0.0);

                [loop]
                for (int i = 0; i < 160; i++)
                {
                    float4 tex = FetchVoxel(cell, vol.xy);
                    if (tex.a >= 0.5)
                    {
                        float ndotl = dot(faceN, objLight);
                        float tSh = smoothstep(-0.25, 0.05, ndotl);
                        float tLit = smoothstep(0.22, 0.52, ndotl);
                        float3 tint = lerp(lerp(float3(0.66, 0.72, 0.86), float3(0.97, 0.98, 1.0), tSh), float3(1.12, 1.10, 1.04), tLit);
                        float hAo = lerp(0.88, 1.0, float(cell.z) / max(bmax.z - 1.0, 1.0));
                        // Unity samples sRGB textures straight into linear light when Color Space = Linear
                        return float4(tex.rgb * tint * hAo, 1.0);
                    }
                    if (tMax.x <= tMax.y && tMax.x <= tMax.z)
                    {
                        cell.x += stepDir.x; tMax.x += tDelta.x;
                        faceN = float3(-float(stepDir.x), 0.0, 0.0);
                    }
                    else if (tMax.y <= tMax.z)
                    {
                        cell.y += stepDir.y; tMax.y += tDelta.y;
                        faceN = float3(0.0, -float(stepDir.y), 0.0);
                    }
                    else
                    {
                        cell.z += stepDir.z; tMax.z += tDelta.z;
                        faceN = float3(0.0, 0.0, -float(stepDir.z));
                    }
                    if (any(cell < int3(0, 0, 0)) || any(cell >= vol)) break;
                }
                return float4(0.0, 0.0, 0.0, 0.0);
            }

            half4 frag(Varyings IN) : SV_Target
            {
                int2 texSz = int2(round(_MainTex_TexelSize.z), round(_MainTex_TexelSize.w));
                int3 vol = int3(texSz.x / max(_Slices, 1), texSz.y, max(_Slices, 1));
                float diag = ceil(length(float2(vol.xy))) + 8.0;
                float2 boxArt = float2(diag + 8.0, ceil(diag * _Squash) + float(vol.z) * _Spacing + 12.0);
                float2 origin = float2(boxArt.x * 0.5, boxArt.y - diag * _Squash * 0.5 - 6.0);

                float ca = cos(_AngleRad);
                float sa = sin(_AngleRad);
                float3 wL = normalize(_SunDir.xyz);
                float3 objL = normalize(float3(wL.x * ca + wL.y * sa, -wL.x * sa + wL.y * ca, wL.z));

                float2 uvTopDown = float2(IN.uv.x, 1.0 - IN.uv.y);
                float4 acc = float4(0.0, 0.0, 0.0, 0.0);
                [unroll]
                for (int i = 0; i < 4; i++)
                {
                    float2 artCoord = (uvTopDown * boxArt) + (RGSS4[i] / max(_DisplayScale, 1.0)) - origin;
                    acc += TraceStackRay(artCoord, vol, ca, sa, objL);
                }
                acc *= 0.25;
                float3 rgb = acc.a > 1e-4 ? (acc.rgb / acc.a) : float3(0.0, 0.0, 0.0);
                return half4(rgb, acc.a);
            }
            ENDHLSL
        }
    }
}
