// Main program logic

// Geometric Modeling: Subdivision and Decimation demo
// by Adam Badke
// adambadke@gmail.com

// The following resources were consulted during the creation of this project:
// - https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL
// - Winged Edge reference material:
//		https://en.wikipedia.org/wiki/Winged_edge#:~:text=In%20computer%20graphics%2C%20the%20winged,edge%20records%2C%20and%20face%20records.
// 		https://people.cs.clemson.edu/~dhouse/courses/405/papers/winged-edge.pdf
//		https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/model/winged-e.html	
// - Edge decimation papers:
//		http://mgarland.org/files/papers/quadrics.pdf
//		http://www.graphics.rwth-aachen.de/media/papers/mcd_vmv021.pdf


var canvas = null;	// HTML Canvas: Populated in main()

/*	HTML -> Javascript hooks:
*
*/

// Mesh controls:
function updateMeshTransform(transformType, transformVal)
{
    theSceneManager._scene._renderObject._transform.updateTransform(transformType, transformVal);
}


// Shading controls:
function setActiveShadingMode(shadingMode)
{
	theSceneManager.setActiveShadingMode(shadingMode);
}


// Subdivision:
function subdivideMesh(subdivisionType, numberOfLevels)
{
	theSceneManager._scene._renderObject._mesh.subdivideMesh(parseInt(subdivisionType), parseInt(numberOfLevels));
}


// Decimation
function decimateMesh(numEdges, k)
{
	if (!isNaN(numEdges) && !isNaN(k))
	{
		theSceneManager._scene._renderObject._mesh.decimateMesh(parseInt(numEdges), parseInt(k));
	}
	else
	{
		alert("[mainProgram][decimateMesh] Invalid input detected: " + numEdges + ", " + k);
	}
}


// function loadOBJ(objURL)
function loadOBJ()
{
	var objURL = document.getElementById("meshOBJDropdown");

	// DEBUG: Override URLS
	//objURL = 'http://www.sfu.ca/~abadke/temp/pyramid.obj';
	// objURL = 'http://www.sfu.ca/~abadke/temp/splitPyramid.obj';
	// objURL = 'http://www.sfu.ca/~abadke/temp/cube4x4.obj';
	// objURL = 'http://www.sfu.ca/~abadke/temp/cubeDegree5Faces.obj';
	//objURL = 'https://gist.githubusercontent.com/MaikKlein/0b6d6bb58772c13593d0a0add6004c1c/raw/48cf9c6d1cdd43cc6862d7d34a68114e2b93d497/cube.obj';
	
	// Set 1:
	//objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/horse_s.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/goodhand.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/venus.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/wheel.obj';
	//objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/walking_monster.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/horse.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/subdivision/chess_piece.obj';
	//objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/subdivision/small_horse.obj';
	
	// Set 2:
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a2/OBJ_files/armhand.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a2/OBJ_files/bigfish.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a2/OBJ_files/bigsmile.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a2/OBJ_files/horse.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a2/OBJ_files/man.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a2/OBJ_files/nice8.obj';

	// Create a new render object and add it to the scene:
	theRenderObject = new renderObject();
	theSceneManager._scene.setRenderObject(theRenderObject);
		
	loadOBJFromURL(objURL.value);
}


function downloadOBJ(filename)
{
	if (theSceneManager._scene._renderObject.isInitialized())
	{
		var text 		= theSceneManager._scene._renderObject._mesh.convertMeshToOBJ();

		// Trigger a download:
		var element = document.createElement('a');
		element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
		element.setAttribute('download', filename);
	
		element.style.display = 'none';
		document.body.appendChild(element);
	
		element.click();
	
		document.body.removeChild(element);
	}
	else
	{
		alert("Cannot download an OBJ when no mesh is loaded. Please load a mesh first.");
	}	
}	


/*	Event handling:
*	
*/
var leftMouseDown 	= false;
var middleMouseDown = false;
var rightMouseDown 	= false;

var eventHandler = function(event)
{
	switch(event.type)
	{
		case "mousedown":
		{
			switch (event.button)
			{
				case 0: // Left mouse button
				{
					leftMouseDown = true;
					break;
				}
				case 1: // Middle mouse button
				{
					middleMouseDown = true;
					break;
				}
				case 2: // Right mouse button
				{
					rightMouseDown = true;
					break;
				}
			}
			break;
		}
		case "mouseup":
		{
			switch(event.button)
			{
				case 0:
				{
					leftMouseDown = false;
					break;
				}
				case 1:
				{
					middleMouseDown = false;
					break;
				}
				case 2:
				{
					rightMouseDown = false;
					break;
				}
			}
			break;
		}

		case "wheel":
		{
			updateMeshTransform(TRANSFORM_TYPE.SCALE_UNIFORM, event.deltaY * 0.1);

			event.preventDefault();	// Prevent the page from scrolling
		}
		break;

		case "mousemove":
		{
			if (leftMouseDown)
			{
				updateMeshTransform(TRANSFORM_TYPE.ROTATE_X, event.movementY);
				updateMeshTransform(TRANSFORM_TYPE.ROTATE_Y, event.movementX);
			}
			
			if (middleMouseDown)
			{
				// if (Math.abs(event.movementX) > Math.abs(event.movementY))
				// {
				// 	updateMeshTransform(TRANSFORM_TYPE.SCALE_UNIFORM, event.movementX);
				// }
				// else
				// {
				// 	updateMeshTransform(TRANSFORM_TYPE.SCALE_UNIFORM, event.movementY);
				// }				

				updateMeshTransform(TRANSFORM_TYPE.TRANSLATE_X, event.movementX / canvas.width);
				updateMeshTransform(TRANSFORM_TYPE.TRANSLATE_Y, -event.movementY / canvas.width)
			}

			if (rightMouseDown)
			{
				updateMeshTransform(TRANSFORM_TYPE.TRANSLATE_X, event.movementX / canvas.width);
				updateMeshTransform(TRANSFORM_TYPE.TRANSLATE_Y, -event.movementY / canvas.width);
			}
			
			break;
		}

		default:
			console.log("[mainProgram][eventHandler] Error: Unhandled event type received");
	}
}




/*	Main program:
*
*/
function main()
{
    
    // Get the canvas from our HTML document:
    canvas = document.querySelector("#glCanvas");

    // Initialize the WebGL context:
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl === null)
    {
        alert("[main] Error: WebGL could not be initialized");
        return;
    }

	// Add event listeners (https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener):
	canvas.addEventListener("mousedown", eventHandler, false);
	canvas.addEventListener("mouseup", eventHandler, false);
	canvas.addEventListener("mousemove", eventHandler, false);
	canvas.addEventListener("wheel", eventHandler, false);
	
    console.log("[mainProgram::main] Successfully initialized WebGL!");

    // Create a scene:
    theSceneManager = new sceneManager();

    // Create a render object:
    theRenderObject = new renderObject();
	
    // Add the renderObject to the scene:
    theSceneManager._scene.setRenderObject(theRenderObject);
    
    // Render our scene!
    theSceneManager.renderScene(performance.now()); // Pass the time since origin
}


// Call our main function:
window.onload = main;


// NOTES:
// Clip space = [-1,1] on ALL axes
// OpenGL is right handed in object and world space
// OpenGL is left handed in screen-space
