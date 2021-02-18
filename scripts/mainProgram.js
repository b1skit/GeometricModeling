// Main program logic

// CMPT 764 Assignment 1
// by Adam Badke
// SFU Student #301310785
// abadke@sfu.ca

// The following resources were consulted during the creation of this assignment:
// - Assignment 1: Provided demo code
// - https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL
// - Winged Edge reference material:
//		https://en.wikipedia.org/wiki/Winged_edge#:~:text=In%20computer%20graphics%2C%20the%20winged,edge%20records%2C%20and%20face%20records.
// 		https://people.cs.clemson.edu/~dhouse/courses/405/papers/winged-edge.pdf
//		https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/model/winged-e.html	



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


function loadOBJ(objURL)
{
	// TODO: CLEANUP:
	//objURL = 'http://www.sfu.ca/~abadke/temp/halfMonster.obj';
	// objURL = 'http://www.sfu.ca/~abadke/temp/pyramid.obj';
	//objURL = 'https://gist.githubusercontent.com/MaikKlein/0b6d6bb58772c13593d0a0add6004c1c/raw/48cf9c6d1cdd43cc6862d7d34a68114e2b93d497/cube.obj';
	// objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/goodhand.obj';
	//objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/horse_s.obj';
	//objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/venus.obj';
	//objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/wheel.obj';
	//objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/walking_monster.obj';
	objURL = 'https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a1/horse.obj';
	
	loadOBJFromURL(objURL);
}


function downloadOBJ()
{
	if (theSceneManager._scene._renderObject.isInitialized())
	{
		var text 		= theSceneManager._scene._renderObject._mesh.convertMeshToOBJ();
		var filename 	= "result.obj";

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


/*	Main program:
*
*/
function main()
{
    
    // Get the canvas from our HTML document:
    const canvas = document.querySelector("#glCanvas");

    // Initialize the WebGL context:
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl === null)
    {
        alert("[main] Error: WebGL could not be initialized");
        return;
    }

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