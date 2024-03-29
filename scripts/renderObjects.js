// renderable objects: Things that are rendered in a scene

// Geometric Modeling: Subdivision and Decimation demo
// by Adam Badke
// adambadke@gmail.com


// Transformation type signal enum:
const TRANSFORM_TYPE = 
{
    TRANSLATE_X : 0,
    TRANSLATE_Y : 1,
    TRANSLATE_Z : 2,

    ROTATE_X    : 3,
    ROTATE_Y    : 4,
    ROTATE_Z    : 5,

    SCALE_X     : 6,
    SCALE_Y     : 7,
    SCALE_Z     : 8,

	SCALE_UNIFORM : 9,
}

const TRANSLATE_SPEED 	= 3.0;	// Scaling factor for X/Y translations via dragging the right mouse button
const SCALE_SENSITIVITY = 0.01;	// Scaling factor for scaling via the middle mouse button

/* 	TRANSFORM CLASS
*	Shared by various render and scene objects
*/
class transform
{
    _position        = [0.0, 0.0, 0.0];
    _rotation        = quat.create();
    _scale           = [1.0, 1.0, 1.0];

    // _rotationEuler   = [0.0, 0.0, 0.0];
	_ZRotation = 0.0;

    constructor()
    {

    }


    // Update the transformation
    // 
    updateTransform(transformType, transformVal)
    {
        switch(transformType)
        {
            // TRANSLATION:
            case TRANSFORM_TYPE.TRANSLATE_X:
                {
                    this._position[0] += TRANSLATE_SPEED * transformVal;
                }
            break;
    
            case TRANSFORM_TYPE.TRANSLATE_Y:
                {
                    this._position[1] += TRANSLATE_SPEED * transformVal;
                }
            break;
    
            case TRANSFORM_TYPE.TRANSLATE_Z:
            {
                this._position[2] = transformVal;
            }
            break;

            // ROTATION:
            case TRANSFORM_TYPE.ROTATE_X:
            {
				var newRotation = quat.create();
                quat.fromEuler(newRotation, transformVal, 0, 0);

				quat.multiply(this._rotation, newRotation, this._rotation);
            }
            break;

            case TRANSFORM_TYPE.ROTATE_Y:
            {
				var newRotation = quat.create();
                quat.fromEuler(newRotation, 0, transformVal, 0);

				quat.multiply(this._rotation, newRotation, this._rotation);
            }
            break;

            case TRANSFORM_TYPE.ROTATE_Z:
            {
				// Do nothing: We no longer support this via mouse controls				
            }
            break;

            // SCALE:
			case TRANSFORM_TYPE.SCALE_UNIFORM:
			{
				this._scale[0] += SCALE_SENSITIVITY * parseFloat(transformVal);
				this._scale[1] += SCALE_SENSITIVITY * parseFloat(transformVal);
				this._scale[2] += SCALE_SENSITIVITY * parseFloat(transformVal);
			}
			break;

            case TRANSFORM_TYPE.SCALE_X:
            {
                this._scale[0] = parseFloat(transformVal);
            }
            break;

            case TRANSFORM_TYPE.SCALE_Y:
            {
                this._scale[1] = parseFloat(transformVal);
            }
            break;

            case TRANSFORM_TYPE.SCALE_Z:
            {
                this._scale[2] = parseFloat(transformVal);
            }
            break;
            
            default:
                console.log("[transform::updateTransform] Invalid transformation type received!");
        }
    }


	// Get the model matrix for this object:
	getModelMatrix()
	{
		// Note: gl-matrix has a "helpful" feature, where the built-in scale/rotate/translate don't multiply
		// matrices in the order you'd expect. To avoid getting super confused and wasting several hours
		// questioning your mathematic abilities, just construct discrete scale/rotate/translate matrices,
		// and then manually multiply them
		// https://github.com/toji/gl-matrix/issues/103
		
		// Scale:
		var scaleMatrix = mat4.create();
		mat4.scale(scaleMatrix, scaleMatrix, this._scale);

		// Rotate:
		var rotateMatrix        = mat4.create();
		var rotationQuatAsMat4  = mat4.create();
		mat4.fromQuat(rotationQuatAsMat4, this._rotation);
		mat4.multiply(rotateMatrix, rotationQuatAsMat4, rotateMatrix);
		
		// Translate:
		var translateMatrix = mat4.create();
		mat4.translate(translateMatrix, translateMatrix, this._position);
		
		// Apply transformations to achieve TRS ordering:
		var modelMatrix = mat4.create();
		mat4.multiply(modelMatrix, scaleMatrix, modelMatrix);
		mat4.multiply(modelMatrix, rotateMatrix, modelMatrix);
		mat4.multiply(modelMatrix, translateMatrix, modelMatrix);

		return modelMatrix;
	}
}


/*  RENDEROBJECT CLASS
*
*/
class renderObject
{
    _mesh       = new mesh();
    _transform  = new transform();


    constructor()
    {

    }

    
    // Getter: Is this renderObject initialized and ready to render?
    // Note: This is required as we load the mesh asyncronously, we might be ready to render before the mesh has downloaded
    isInitialized()
    {
        return this._mesh.isInitialized();
    }


	setActiveShadingMode(shadingMode)
	{
		this._mesh.setActiveShadingMode(shadingMode);
	}

}


/*  MATERIAL CLASS
*
*/
class material
{
	_shader 			= null;
	_wireframeShader	= null;

	_color 				= null;
	_wireframeColor 	= null;

    constructor()
    {
		this._color 			= vec3.fromValues(0.75, 0.75, 0.75);
		this._wireframeColor 	= vec3.fromValues(0.263, 1.0, 0.639);

		this._shader = new shader();
		this._shader.initialize(vsSource_Phong, fsSource_Phong);

		this._wireframeShader = new shader();
		this._wireframeShader.initialize(vsSource_Wireframe, fsSource_Wireframe);
    }
}


/*  SHADER CLASS
*
*/
class shader
{
    _shaderProgram = null;  // Allocated when initialize() is called

    constructor()
    {

    }


    /*  Compiles, attaches, and links a shader:
    * 
    */
    initialize(vsSource, fsSource)
    {
		// Cleanup any pre-existing shader:
		if (this._shaderProgram != null)
		{
			console.log("[renderObjects::shader::initialize] Deallocating previous shader...");
			gl.deleteProgram(this._shaderProgram);
			this._shaderProgram = null;
		}

        // Load new shaders:
        const vertShader    = this.compileShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragShader    = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);

        // Compile and link:
        this._shaderProgram = gl.createProgram();
        gl.attachShader(this._shaderProgram, vertShader);
        gl.attachShader(this._shaderProgram, fragShader);
        gl.linkProgram(this._shaderProgram);

        // Ensure we were successful:
        if (!gl.getProgramParameter(this._shaderProgram, gl.LINK_STATUS))
        {
            alert("[renderObjects::shader::initialize] Could not compile shaders: " + gl.getProgramInfoLog(this._shaderProgram));
            return null;
        }

        console.log("[renderObjects::shader::initialize] Successfully compiled shaders!");
    }

    
    // Helper function: Compile a shader:
    compileShader(gl, type, source)
    {
        const shader = gl.createShader(type);

        // Set the source code of the shader:
        gl.shaderSource(shader, source);

        // Compile the shader:
        gl.compileShader(shader);

        // Ensure we were successful:
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        {
            alert("[renderObjects::shader::compileShader] Shader loading failed:\n\n" + gl.getShaderInfoLog(shader));

            // Cleanup:
            gl.deleteShader(shader);    
            return null;
        }

        // Success:
        return shader;
    }


    // Bind a shader for rendering:
    bind()
    {
        gl.useProgram(this._shaderProgram);
    }


    // Upload a 4x4 floating point matrix:
    setUniformMatrix4fv(gl, locationName, doTranspose, theMatrix)
    {
        gl.uniformMatrix4fv
        (
            gl.getUniformLocation(this._shaderProgram, locationName),
            doTranspose,
            theMatrix
        );
    }

    // Uploaded a floating point 3-vector:
    setUniform3fv(gl, locationName, theVector)
    {
        gl.uniform3fv(
            gl.getUniformLocation(this._shaderProgram, locationName), 
            theVector
        );
    }

	// Upload an integer value:
	setUnform1i(locationName, theValue)
	{
		gl.uniform1i(
			gl.getUniformLocation(this._shaderProgram, locationName), 
            theValue
		);
	}
}