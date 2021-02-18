// GLSL Shaders as JS strings

// CMPT 764 Assignment 1
// by Adam Badke
// SFU Student #301310785
// abadke@sfu.ca





/*	PHONG SHADER (SMOOTH)
*
*/
// VERTEX SHADER:
const vsSource_Phong = `
attribute vec4 in_position;
attribute vec3 in_normal;
attribute vec4 in_vertexColor;

uniform mat4 in_M;
uniform mat4 in_MV;
uniform mat4 in_P;

// Outputs:
// NOTE: If these aren't used in the shader and you try and upload values, WebGL will complain
varying vec4 fragPosW;
varying vec4 fragColor;
varying vec3 fragNormal;

void main()
{
	// Output fragment varyings:
	fragPosW    = in_M * in_position;
	fragNormal  = normalize((in_M * vec4(in_normal.xyz, 0.0)).xyz);	// NOTE: We must normalize incase there was scaling in the matrix
	fragColor   = in_vertexColor; 

	// Output vertex position:
	gl_Position = in_P * in_MV * in_position;
}
`;


// FRAGMENT SHADER:
const fsSource_Phong = `
// Specify the "default" precision for the shader:
precision highp float;

// Uniforms:
uniform vec3 in_cameraPosW;
uniform vec3 in_color; 			// A single color

// Vertex->Fragment inputs:
varying vec4 fragPosW;
varying vec4 fragColor;
varying vec3 fragNormal;

void main()
{
	// TODO: Upload these:
	const vec3 ambientIntensity		= vec3(0.395, 0.445, 0.5);
	const vec3 keyLightDir 			= normalize( vec3(1.0, -1.0, -1.0) );  // Incoming light direction: Sun -> fragment
	const vec3 keyLightIntensity	= vec3(0.79, 0.89, 1.0) * vec3(2);
	const float specularExponent   	= 50.0;

	// Assemble vectors:
	vec3 V  = normalize(in_cameraPosW - fragPosW.xyz);  // View ray: Fragment -> Camera
	vec3 R  = reflect(keyLightDir, fragNormal);           	// Reflection ray: Incoming light ray bouncing off our fragment about the normal

	float NoL = max(dot(-keyLightDir, fragNormal), 0.0);   // NOTE: We reverse the light direction, as we want the direction TO the light
	float RoV = max(dot(R, V), 0.0);

	// vec3 albedo = fragColor;
	vec3 albedo = in_color;
	
	
	vec3 ambientContribution 	= ambientIntensity.xyz * albedo.xyz;
	vec3 diffuseContribution 	= keyLightIntensity * NoL * albedo.xyz;
	vec3 specularContribution 	= keyLightIntensity * pow(RoV, specularExponent) * albedo.xyz;

	vec3 shadedColor = ambientContribution + diffuseContribution + specularContribution;

	// Tonemap to [0,1]:
	shadedColor = shadedColor / (vec3(1) + shadedColor);

	gl_FragColor = vec4(shadedColor, 1.0);
	//gl_FragColor = vec4(fragNormal, 1.0);
}
`;