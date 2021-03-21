// Scene objects: Environment that renderObjects are rendered in/with

// CMPT 764 Assignment 1/2
// by Adam Badke
// SFU Student #301310785
// abadke@sfu.ca



// Render loop callback:
function renderLoopCallback(currentTime)
{
    theSceneManager.renderScene(currentTime);
}


class sceneManager
{
    _scene      	= null;
    _prevTime   	= 0;    // Time in the previous frame


    constructor()
    {
        this._scene     = new scene();
        this._prevTime  = performance.now(); // Ensure we have a valid time when we begin

        // Move the camera back a bit:
        this._scene._camera._transform.updateTransform(TRANSFORM_TYPE.TRANSLATE_Z, 5.0);    // Z+ is towards the screen in OpenGL

        console.log("[sceneObjects::sceneManager::constructor] Scene manager constructed!");   
    }


	// Set the global shading mode for the scene's renderObject:
	setActiveShadingMode(shadingMode)
	{
		if (this._scene._renderObject != null)
		{
			this._scene._renderObject.setActiveShadingMode(shadingMode);
		}
		else
		{
			console.log("[sceneManager][setActiveShader] Cannot set shading mode: No renderObject currently exists");
		}
	}


    // Render the scene:
    renderScene(currentTime)
    {
        // Update the time:
        const deltaTime = currentTime - this._prevTime;
        this._prevTime  = currentTime;

        // Clear the framebuffers:
        gl.clearColor = (0.0, 0.0, 0.0, 1.0);
        gl.clearDepth(1.0);

        // Configure the state:
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        // gl.enable(gl.CULL_FACE); // Default winding order is CCW
        // gl.cullFace(gl.BACK);   // Default culling mode is gl.BACK	

        // Clear the canvas:
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Only attempt rendering if we've got a valid renderObject:
        if (this._scene._renderObject.isInitialized())
        {
            // Bind mesh buffers:
            this._scene._renderObject._mesh.bindBuffers(gl);

            // Bind shader:
			this._scene._renderObject._mesh._material._shader.bind();

			// Configure the shader:
			this.configureShaderForCurrentRender(this._scene._renderObject._mesh._material._shader);

			const offset        = 0;

			// Draw solid polygons:
			if (this._scene._renderObject._mesh._shadingMode != SHADING_MODE.WIREFRAME)
			{
				// Draw!
				gl.drawArrays(gl.TRIANGLES, 0, this._scene._renderObject._mesh._positionData.length);
			}

			// Draw wireframe, if required:
			if (this._scene._renderObject._mesh._shadingMode == SHADING_MODE.WIREFRAME || this._scene._renderObject._mesh._shadingMode == SHADING_MODE.SHADED_WIREFRAME)
			{
				this._scene._renderObject._mesh.bindBuffers(gl, true);

				// Configure the shader:
				this._scene._renderObject._mesh._material._wireframeShader.bind();
				this.configureShaderForCurrentRender(this._scene._renderObject._mesh._material._wireframeShader, true);

				gl.lineWidth(2.0);	// Deprecated, doesn't seem to have any effect but we set it anyway...

				// Draw!
				gl.drawArrays(gl.LINES, 0, this._scene._renderObject._mesh._positionData.length);
			}
        }

        requestAnimationFrame(renderLoopCallback);
    } // end renderScene


	// Helper function: Configure a shader for rendering by uploading uniforms etc
	configureShaderForCurrentRender(activeShader, isWireframe = false)
	{
		// Assemble the model view (MV) matrix:
		const modelMatrix = this._scene._renderObject.getModelMatrix();

		const viewMatrix = this._scene._camera.getViewMatrix();

		var modelViewMatrix = mat4.create();
		mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);    // 1st param is output


		// Set the shader uniforms:
		const projectionMatrix = this._scene._camera.getProjectionMatrix();
		activeShader.setUniformMatrix4fv(gl, 'in_P', false, projectionMatrix);
		activeShader.setUniformMatrix4fv(gl, 'in_MV', false, modelViewMatrix);
		activeShader.setUniformMatrix4fv(gl, 'in_M', false, modelMatrix);

		// Upload the camera position:
		activeShader.setUniform3fv(gl, 'in_cameraPosW', this._scene._camera._transform._position);

		// Upload appropriate color:
		if (!isWireframe)
		{
			activeShader.setUniform3fv(gl, 'in_color', isWireframe ? this._scene._renderObject._mesh._material._wireframeColor : this._scene._renderObject._mesh._material._color);
		}		
	}
}


class scene
{
    _renderObject       = null;

    _camera             = null
    _directionalLight   = new directionalLight();

    constructor()
    {
        this._camera = new camera();
    }

    setRenderObject(newRenderObject)
    {
        this._renderObject = newRenderObject;
    }
}


class camera
{
    _FOV               = 45.0 * Math.PI / 180.0; // Field of view, in radians
    _aspectRatio       = 640.0 / 480.0; // Set a default aspect ratio (updated when constructor() is called)
    _zNear             = 0.1;
    _zFar              = 1000.0;

    _transform          = new transform();

    constructor()
    {
        this._aspectRatio    = gl.canvas.clientWidth / gl.canvas.clientHeight;
    }


    // Create and populate a projection matrix:
    getProjectionMatrix()
    {
        
        var projectionMatrix  = mat4.create();
        mat4.perspective(projectionMatrix, this._FOV, this._aspectRatio, this._zNear, this._zFar);

        return projectionMatrix;
    }


    // Create and populate a view matrix (ie. the inverse of the camera's world matrix):
    getViewMatrix()
    {
        var viewMatrix = mat4.create();
        mat4.translate(viewMatrix, viewMatrix, this._transform._position); // Note: 1st arg is the destination

        mat4.invert(viewMatrix, viewMatrix);

        return viewMatrix;
    }
}


class directionalLight
{
    _transform          = new transform();

	_direction 			= vec3.fromValues(0.5773502588272095, -0.5773502588272095, -0.5773502588272095);	// Normalized vector equivalent to [1, -1, -1]

	// TODO: Upload and use this vector

    constructor()
    {

    }
}