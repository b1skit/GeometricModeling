// Shared values and helpers

// Geometric Modeling: Subdivision and Decimation demo
// by Adam Badke
// adambadke@gmail.com


// Global vars, for convenience:
var theSceneManager = null;
var gl              = null;


// // World-space X/Y/Z axis enum:
// const WORLD_AXIS =
// {
//     X : [1.0, 0.0, 0.0],
//     Y : [0.0, 1.0, 0.0],
//     Z : [0.0, 0.0, 1.0]
// }


// Math literals:
const TWO_PI 				= 2.0 * Math.PI;
const FOUR_PI				= 4.0 * Math.PI;

const ONE_OVER_TWO			= 1.0 / 2.0;

const THREE_OVER_FOUR 		= 3.0 / 4.0;
const ONE_OVER_FOUR			= 1.0 / 4.0;

const ONE_OVER_EIGHT		= 1.0 / 8.0;
const THREE_OVER_EIGHT 		= 3.0 / 8.0;
const FIVE_OVER_EIGHT 		= 5.0 / 8.0;

const FIVE_OVER_TWELVE 		= 5.0 / 12.0;

const NEG_ONE_OVER_EIGHT	= -1.0 / 8.0;
const NEG_ONE_OVER_TWELVE	= -1.0 / 12.0;
const NEG_ONE_OVER_SIXTEEN	= -1.0 / 16.0;

// Shading mode enum:
const SHADING_MODE = 
{
	FLAT 				: 0,
	SMOOTH				: 1,
	WIREFRAME 			: 2,
	SHADED_WIREFRAME	: 3
};



const SUBDIVISION_TYPE =
{
	LOOP 		: 0,
	BUTTERFLY 	: 1,
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


// Helper function: Pretty-print a mat4
function prettyPrintMat4(mat)
{
	var str = 	mat[0] + ",\t" + mat[4] + ",\t" + mat[8] +  ",\t" + mat[12] + "\n" + 
				mat[1] + ",\t" + mat[5] + ",\t" + mat[9] +  ",\t" + mat[13] + "\n" + 
				mat[2] + ",\t" + mat[6] + ",\t" + mat[10] + ",\t" + mat[14] + "\n" + 
				mat[3] + ",\t" + mat[7] + ",\t" + mat[11] + ",\t" + mat[15] + "\n";
	
	console.log(str);
}