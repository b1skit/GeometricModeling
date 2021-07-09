// renderable objects: Things that are rendered in a scene

// Geometric Modeling
// by Adam Badke
// adambadke@gmail.com



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


    // Get the model matrix for this object:
    getModelMatrix()
    {
        // Note: gl-matrix has a "helpful" feature, where the built-in scale/rotate/translate don't multiply
        // matrices in the order you'd expect. To avoid getting super confused and wasting several hours
        // questioning your mathematic abilities, just construct discrete scale/rotate/translate matrices,
        // and then manually multiply them
        // https://github.com/toji/gl-matrix/issues/103
        
		// TODO: Move this to the transform class

        // Scale:
        var scaleMatrix = mat4.create();
        mat4.scale(scaleMatrix, scaleMatrix, this._transform._scale);

        // Rotate:
        var rotateMatrix        = mat4.create();
        var rotationQuatAsMat4  = mat4.create();
        mat4.fromQuat(rotationQuatAsMat4, this._transform._rotation);
        mat4.multiply(rotateMatrix, rotationQuatAsMat4, rotateMatrix);
        
        // Translate:
        var translateMatrix = mat4.create();
        mat4.translate(translateMatrix, translateMatrix, this._transform._position);
        
        // Apply transformations to achieve TRS ordering:
        var modelMatrix = mat4.create();
        mat4.multiply(modelMatrix, scaleMatrix, modelMatrix);
        mat4.multiply(modelMatrix, rotateMatrix, modelMatrix);
        mat4.multiply(modelMatrix, translateMatrix, modelMatrix);

        return modelMatrix;
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
		this._wireframeColor 	= vec3.fromValues(1.0, 0.0, 0.0);

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


/*  ------------ HELPER FUNCTIONS ------------
*
*/

// Helper function: Load a .obj mesh file from a URL
// Note: Due to security restrictions, we can't load local files, so we load via a URL instead
function loadOBJFromURL(fileURL)
{
    console.log("[renderObjects::mesh::loadMeshFromFile] Loading file from URL \"" + fileURL + "\"");

    var client = new XMLHttpRequest();
    
    client.open('GET', fileURL);
    client.onreadystatechange = function()
    {
		switch(client.readyState)	// https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/readyState
		{
			case 0:	// UNSENT
			{
				console.log("[renderObjects::mesh::loadMeshFromFile] Client ready state: UNSENT...");
			}
			break;

			case 1:	// OPENED
			{
				console.log("[renderObjects::mesh::loadMeshFromFile] Client ready state: OPENED...");
			}
			break;

			case 2:	// HEADERS_RECEIVED
			{
				console.log("[renderObjects::mesh::loadMeshFromFile] Client ready state: HEADERS_RECEIVED...");
			}
			break;

			case 3:	// LOADING
			{
				console.log("[renderObjects::mesh::loadMeshFromFile] Client ready state: LOADING...");
			}
			break;
			
			case 4:	// DONE
			{
				console.log("[renderObjects::mesh::loadMeshFromFile] Client ready state: DONE!");

				// Load the received OBJ:
				theSceneManager._scene._renderObject._mesh.constructMeshFromOBJData(client.responseText);	
			}
			break;
		}  
    }
    client.send();
}