// mesh object: Geometry contained by a renderObject

// CMPT 764 Assignment 1
// by Adam Badke
// SFU Student #301310785
// abadke@sfu.ca



/*  Face class
*
*/
class face
{
	// Vertex attributes for the current face:
	_normals 		= [];
	_uvs			= [];

	_normalsOBJIndexes 	= [];
	_uvsOBJIndexes 		= [];

	_faceNormal		= null;

    // Winged-edge adjacency references:
    _edge   = null;

    constructor()
    {
		for (var currentVert = 0; currentVert < 3; currentVert++)
		{
			// Initialize the OBJ indexes:
			this._normalsOBJIndexes.push(-1);
			this._uvsOBJIndexes.push(-1);
		}
    }
}


/*  Vertex class
*
*/
class vertex
{
    // Vertex properties:
    _position   	= null;
	
	// Smoothed normals:
	_smoothedNormal = null;
	_adjacentFaces 	= 0;	// Used to average the neighboring face normals

    // Winged-edge adjacency references:
    _edge       = null;
	_vertIndex 	= -1;	// The index of the mesh._vertices array that this vertex is stored in. Used for efficient OBJ output

	constructor(px, py, pz, vertIndex)
    {
        // Position:
        this._position      	= vec3.fromValues(px, py, pz);

		this._smoothedNormal 	= vec3.fromValues(0.0, 0.0, 0.0);

		this._vertIndex 		= vertIndex;
    }


	// Compare this vertex against another.
	// Returns true if they share the same position, false otherwise.
	equals(otherVert)
	{
		// For adjacency purposes, we only care if vertex positions are the same
		return vec3.equals(this._position, otherVert._position);
	}
}


/*  Edge class
*
*/
class edge
{
    // Winged-edge adjacency references:
    _vertOrigin     = null;
    _vertDest       = null;

    _faceLeft       = null;
    _faceRight      = null;

    _edgeLeftCW     = null;
    _edgeLeftCCW    = null;
    _edgeRightCW    = null;
    _edgeRightCCW   = null;


    constructor(vertOrigin, vertDest)
    {
		this._vertOrigin 	= vertOrigin;
		this._vertDest 		= vertDest;

		// Update the vertex -> edge pointer:
		if (this._vertOrigin._edge == null)
		{
			this._vertOrigin._edge = this;	
		}
    }

	
	// Check if 2 edge objects are defined by the same 2 vertices
	equals(otherEdge)
	{
		return (
			(this._vertOrigin.equals(otherEdge._vertOrigin) && this._vertDest.equals(otherEdge._vertDest)) ||
			(this._vertOrigin.equals(otherEdge._vertDest) 	&& this._vertDest.equals(otherEdge._vertOrigin))
		);
	}
}


/*  MESH CLASS
*
*/
class mesh
{
    _material       			= new material();

    // WebGL identifiers:
    _positionsBuffer       		= null;     // Vertex positions: Allocated when initializeBuffers() is called
    _positionData          		= [];

	_wireframePositionsBuffer 	= null;
	_wireframePositionsData 	= [];

    _OBJNormalsBuffer			= null;     // OBJ Vertex normals
    _OBJNormalsData				= [];
	
	_smoothNormalsBuffer		= null;     // "Smoothed" vertex normals, found by averaging neighboring vertices
    _smoothNormalsData			= [];
	
    _colorBuffer            	= null;     // Vertex colors
    _colorData        			= [];
	
	_shadingMode 				= SHADING_MODE.SMOOTH;

    // Winged-edge structure:
    _faces      = null;
    _edges      = null;
    _vertices   = null;


    constructor()
    {

    }


	// Set the shading mode:
	setActiveShadingMode(shadingMode)
	{
		this._shadingMode = shadingMode;
	}


	// Inserts a vertex if it has not been seen before, and returns the vertex at candidateVertex._vertIndex
	addVertexIfUnique(candidateVertex)
	{
		if (this._vertices[candidateVertex._vertIndex] == null)
		{
			this._vertices[candidateVertex._vertIndex] = candidateVertex;
		}

		return this._vertices[candidateVertex._vertIndex];
	}


	// Inserts an edge (and its inverse) if it has not been seet before. Returns the inserted/existing edge with the same orientation as the received candidate edge:
	addEdgeIfUnique(candidateEdge)
	{
		var originVertIndex = candidateEdge._vertOrigin._vertIndex;
		var destVertIndex 	= candidateEdge._vertDest._vertIndex;

		// If the edge doesn't exist, add it and its inverse to the edges table:
		if(this._edges[originVertIndex][destVertIndex] == null)
		{
			this._edges[originVertIndex][destVertIndex] = candidateEdge;

			var inverseEdge = new edge(candidateEdge._vertDest, candidateEdge._vertOrigin);

			this._edges[destVertIndex][originVertIndex] = inverseEdge;
		}

		return this._edges[originVertIndex][destVertIndex];
	}

    // Load data received from an .obj file into our mesh:
    constructMeshFromOBJData(objData)
    {
        console.log("[renderObjects::mesh::constructMeshFromOBJData] Constructing mesh from obj data...");

        // Extracted geometry:
        var extractedVerts      = [];
        var extractedUVs        = [];
        var extractedNormals    = [];
        var extractedFaces      = [];

        // Split the obj per line:
        var objLines = objData.split('\n');
        
		// Process the OBJ, line-by-line:
        for(var i = 0; i < objLines.length; i++)
        {
            // Trim whitespace to ensure single-spacing:
            objLines[i] = objLines[i].replace(/\s+/g, ' ').trim();

            // Split on spaces:
            var lineParts = objLines[i].split(' ');

            // Skip irrelevant lines:
            if (
                lineParts[0].includes('#')  ||  // Comments
                (lineParts[0].length > 2 )  ||  // Looking for v, vt, vn, f only
                (!lineParts[0].includes('v') && !(lineParts[0] === 'f'))
            )
            {
                continue;
            }

			var nonStandardOBJ = false;

            // Process the current line:
            switch(lineParts[0])
            {
                // Vertices:
                case "v":
                {
                    if (lineParts.length != 4)
                    {
						nonStandardOBJ = true;
                    }
                    
                    // Convert each value to a float and push it to our vertex list:
                    var vertXYZ = [];
                    for (var currentLinePart = 1; currentLinePart < 4; currentLinePart++)
                    {
                        vertXYZ.push( parseFloat(lineParts[currentLinePart]) );
                    }
                    extractedVerts.push( vertXYZ );	// vertXYZ = [x, y, z]
                }
                break;

                // Texture coords:
                case "vt":
                {
                    if (lineParts.length != 3 && lineParts.length != 4)
                    {
                        nonStandardOBJ = true;
                    }
                    
                    // Convert each value to a float and push it to our vertex list:
                    var UV = [];
                    for (var currentLinePart = 1; currentLinePart < 3; currentLinePart++)
                    {
                        UV.push( parseFloat(lineParts[currentLinePart]) );
                    }
                    extractedUVs.push( UV );
                }
                break;

                // Normals:
                case "vn":
                {
                    if (lineParts.length != 4)
                    {
                        nonStandardOBJ = true;
                    }
                    
                    // Convert each value to a float and push it to our vertex list:
                    var normalXYZ = [];
                    for (var currentLinePart = 1; currentLinePart < 4; currentLinePart++)
                    {
                        normalXYZ.push( parseFloat(lineParts[currentLinePart]) );
                    }
                    extractedNormals.push( normalXYZ );
                }
                break;

                // Faces:
                case "f":
                {
                    if (lineParts.length != 4)
                    {
                        nonStandardOBJ = true;
                    }

                    // Determine which of the possible face encodings we're reading:
                    // v v v,                       Positions only              1
                    // v/vt, v/vt, v/vt             Positions + UVs             2
                    // v/vt/vn, v/vt/vn, v/vt/vn    Positions, UVs, Normals     3
                    // v//vn, v//vn, v//vn          Positions + Normals         3
                    var numEntries = lineParts[1].split('/').length;

                    var faceEntry = []; // We'll populate this with the current face data:  [ [1x3], [1x3], [1x3] ]
                    
                    // Faces are sets of indexes into the vertex position, uv, and normal arrays.
                    // Convert each index to a int and push it to the appropriate list:
                    for (var currentLinePart = 1; currentLinePart < 4; currentLinePart++)
                    {
                        // Split the current entry:
                        var extractedIndexes = lineParts[currentLinePart].split('/');

                        // Insert the indexes.
                        // NOTE: -1 == null entry. We subtract -1 from each index, as .OBJ indexes are 1-based
                        switch(numEntries)
                        {
                            case 1: // v v v
                            {
                                faceEntry.push( [parseInt(extractedIndexes[0]) - 1, -1, -1] ); 
                            }
                            break;

                            case 2: // v/vt, v/vt, v/vt 
                            {
                                faceEntry.push( [parseInt(extractedIndexes[0]) - 1, parseInt(extractedIndexes[1]) - 1, -1] );
                            }
                            break;

                            case 3: // v/vt/vn, v/vt/vn, v/vt/vn  -OR-  v//vn, v//vn, v//vn 
                            {
                                if (extractedIndexes[1] === "")
                                {
                                    // v//vn, v//vn, v//vn 
                                    faceEntry.push( [parseInt(extractedIndexes[0]) - 1, -1, parseInt(extractedIndexes[2]) - 1] );
                                }
                                else                            
                                {
                                    // v/vt/vn, v/vt/vn, v/vt/vn
                                    faceEntry.push( [ parseInt(extractedIndexes[0]) - 1, parseInt(extractedIndexes[1]) - 1, parseInt(extractedIndexes[2]) - 1 ] );
                                }                                    
                            }
                            break;

                            default:
								{
									console.log("[mesh::constructMeshFromOBJData] Error: Non-standard face found while parsing obj: \"" + objLines[i] + "\"");
									nonStandardOBJ = true;
								}
                        }
                    }

                    // Finally, push the [ [1x3], [1x3], [1x3] ] to our extracted faces list:
                    extractedFaces.push(faceEntry);
                }
                break;

                default:
                    console.log("[mesh::constructMeshFromOBJData] Skipping non-geometry descriptor while parsing obj: \"" + objLines[i] + "\"");
            }   // end switch
            
        } // end objLines loop

		if (nonStandardOBJ)
		{
			alert("[mesh::constructMeshFromOBJData] Warning: Non-standard .OBJ detected... Results may be unexpected!");
		}	   
     
		// (Re)Initialize our winged-edge structures:
        this._vertices 	= [];
		for (var currentVert = 0; currentVert < extractedVerts.length; currentVert++)
		{
			this._vertices.push(null);	// Pre-allocate the vertices array
		}
		// 2D edge table:
		this._edges 	= [];
		for (var currentRow = 0; currentRow < extractedVerts.length; currentRow++)
		{
			this._edges.push(new Array());
			for (var currentCol = 0; currentCol < extractedVerts.length; currentCol++)
			{
				this._edges[currentRow].push(null);
			}
		}

		this._faces 	= [];

		// Construct our winged data structure using the extracted face indexes:
        for (var currentFace = 0; currentFace < extractedFaces.length; currentFace++)
        {
			// Construct the current face:
			var newFace 	= new face();

			// Construct the vertices:
			var newFaceVerts 	= [];
			var hasNormal 		= false;
			for (var currentVertex = 0; currentVertex < 3; currentVertex++)
			{
				// Indexing:
				// extractedFaces[currentFace][ [v, vt, vn], [v, vt, vn], [v, vt, vn] ]
        		// extractedFaces[currentFace][ 0:[0, 1, 2], 1:[0, 1, 2], 2:[0, 1, 2] ]

				// Assemble vert position:
				const vertIndex = extractedFaces[currentFace][currentVertex][0];
                const px = extractedVerts[ vertIndex ][0];	// extractedVerts[] = [x, y, z]
                const py = extractedVerts[ vertIndex ][1];
                const pz = extractedVerts[ vertIndex ][2];

				// Construct the vertex:
				var candidateVertex = new vertex(px, py, pz, vertIndex);

				newFaceVerts[currentVertex] = this.addVertexIfUnique(candidateVertex);

                // Assemble UVs:
                var u, v = 0;
                var hasUVs = extractedFaces[currentFace][0][1] != -1;   // Check first vertex in the face
                if(hasUVs)
                {
                    u = extractedUVs[ extractedFaces[currentFace][currentVertex][1] ][0];
                    v = extractedUVs[ extractedFaces[currentFace][currentVertex][1] ][1];

					// Store the index:
					var UVOBJIndex = extractedFaces[currentFace][0][1];
					newFace._uvsOBJIndexes[currentVertex] = UVOBJIndex;
                }
				// Add the UVs to the face:
				newFace._uvs.push( vec2.fromValues(u, v) );

                // Assemble normal:
                var nx, ny, nz = 0;
                hasNormal = extractedFaces[currentFace][0][2] != -1;    // Check first vertex in the face
                if (hasNormal)
                {
                    nx = extractedNormals[ extractedFaces[currentFace][currentVertex][2] ][0];
                    ny = extractedNormals[ extractedFaces[currentFace][currentVertex][2] ][1];
                    nz = extractedNormals[ extractedFaces[currentFace][currentVertex][2] ][2];

					// Add the normals to the face:
					newFace._normals.push( vec3.fromValues(nx, ny, nz) );

					// Store the index:
					var normalOBJIndex = extractedFaces[currentFace][0][2];
					newFace._normalsOBJIndexes[currentVertex] = normalOBJIndex;
                }
			} // end vertex construction


			var newFaceEdges = [
				new edge(newFaceVerts[0], newFaceVerts[1]),
				new edge(newFaceVerts[1], newFaceVerts[2]),
				new edge(newFaceVerts[2], newFaceVerts[0]),
			];	// NOTE: Edge construction sets the origin vertex -> edge pointer, if it's not already set

			// Update the edges table:
			for (var currentEdge = 0; currentEdge < 3; currentEdge++)
			{
				newFaceEdges[currentEdge] = this.addEdgeIfUnique(newFaceEdges[currentEdge]);
			}

			// Construct face normal:
			var v1 = vec3.create();				
			vec3.subtract(v1, newFaceVerts[0]._position, newFaceVerts[1]._position);
			vec3.normalize(v1, v1);

			var v2 = vec3.create();				
			vec3.subtract(v2, newFaceVerts[2]._position, newFaceVerts[1]._position);
			vec3.normalize(v2, v2);

			newFace._faceNormal = vec3.create();
			vec3.cross(newFace._faceNormal, v2, v1);
			vec3.normalize(newFace._faceNormal, newFace._faceNormal);

			// If no normals were received, use the face normal
			if (!hasNormal)
			{				
				newFace._normals.push(newFace._faceNormal);	// We push it 3 times (once for each vertex)
				newFace._normals.push(newFace._faceNormal);
				newFace._normals.push(newFace._faceNormal);
			}

			// Update the pointers:
			for (var currentEdge = 0; currentEdge < newFaceEdges.length; currentEdge++)
			{
				// NOTE: Edge construction already set the origin vertex -> edge pointers

				var originVertIndex = newFaceEdges[currentEdge]._vertOrigin._vertIndex;
				var destVertIndex 	= newFaceEdges[currentEdge]._vertDest._vertIndex;

				var inverseEdge 	= this._edges[destVertIndex][originVertIndex];

				// Update pointers for the current face and its edges:
				newFaceEdges[currentEdge]._faceLeft = newFace;
				inverseEdge._faceRight 				= newFace;

				if (inverseEdge._faceLeft != null)
				{
					newFaceEdges[currentEdge]._faceRight = inverseEdge._faceLeft;
				}

				// Update edge pointers:
				var nextEdgeIndex	= (currentEdge + 1) % 3;	// next/prev w.r.t CCW
				var prevEdgeIndex	= currentEdge == 0 ? 2 : ((currentEdge - 1) % 3);

				// Current edge: CW, CCW:
				newFaceEdges[currentEdge]._edgeLeftCCW 	= newFaceEdges[nextEdgeIndex];
				newFaceEdges[currentEdge]._edgeLeftCW 	= newFaceEdges[prevEdgeIndex];

				// Inverse edge: Right CCW
				var nextCCWEdgeOriginVertIndex 	= destVertIndex;
				var nextCCWEdgeDestVertIndex 	= newFaceEdges[currentEdge]._edgeLeftCCW._vertDest._vertIndex;
				inverseEdge._edgeRightCCW 		= this._edges[nextCCWEdgeOriginVertIndex][nextCCWEdgeDestVertIndex];

				// Inverse edge: Right CW
				var prevCWEdgeDestVertIndex 	= originVertIndex;
				var prevCWEdgeOriginVertIndex 	= newFaceEdges[currentEdge]._edgeLeftCW._vertOrigin._vertIndex;
				inverseEdge._edgeRightCW 		= this._edges[prevCWEdgeDestVertIndex][prevCWEdgeOriginVertIndex];
			}

			// Now that we have our final edges, update the face -> edge pointer
			newFace._edge 	= newFaceEdges[0];
			this._faces.push(newFace);

        }	// end face parsing

		// Prepare to compute smooth normals (results here are averaged during initializeBuffers()):
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			var startEdge 	= this._faces[currentFace]._edge;
			var currentEdge = this._faces[currentFace]._edge;
			do
			{
				vec3.add(currentEdge._vertOrigin._smoothedNormal, currentEdge._vertOrigin._smoothedNormal, currentEdge._faceLeft._faceNormal);
				currentEdge._vertOrigin._adjacentFaces++;

				currentEdge = currentEdge._edgeLeftCCW;

			} while (currentEdge != startEdge);
		}

		console.log("[mesh::constructMeshFromOBJData] Extracted " + this._vertices.length + " vertices, " + (this._faces.length * 3) + " (bi-directional) edges, " + this._faces.length + " faces to the winged data structure");

        // Finally, initialize the render object mesh's vertex buffers:
        this.initializeBuffers();
    }


	convertMeshToOBJ()
	{
		var objText = "# OBJ output: CMPT 764, Adam Badke\n\n";

		// Construct vertex strings:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{			
			objText += "v " + this.formatFloatValueForOBJOutput(this._vertices[currentVert]._position[0]) + " " + this.formatFloatValueForOBJOutput(this._vertices[currentVert]._position[1]) + " " + this.formatFloatValueForOBJOutput(this._vertices[currentVert]._position[2]) + "\n";
		}


		var uvSection 		= "";
		var normalSection 	= "";
		var faceSection 	= "";

		var hasUVs = this._faces[0]._uvs.length > 0; 	// Assume if the first face has UV's, they all do...
		
		var currentUVIndex 		= 1;	// Start at 1, as OBJ's use 1-based indexing
		var currentNormalIndex 	= 1;

		// Construct face strings:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			// UVs:
			var currentUVString = "";
			var currentUVIndexStrings = [];
			
			if (this._faces[currentFace]._uvs.length > 0)
			{
				for (var currentUV = 0; currentUV < this._faces[currentFace]._uvs.length; currentUV++)
				{
					currentUVString += "vt " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._uvs[currentUV][0]) + " " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._uvs[currentUV][1]) + "\n";
					currentUVIndexStrings.push(currentUVIndex++);
				}
			}
			else if (hasUVs)
			{
				console.log("[mesh::convertMeshToOBJ] Error: Some faces are missing uvs" );
			}
			
			// Normals:
			var currentNormalString = "";
			for (var currentNormal = 0; currentNormal < this._faces[currentFace]._normals.length; currentNormal++)
			{
				currentNormalString += "vn " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._faceNormal[0]) + " " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._faceNormal[1]) + " " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._faceNormal[2]) + "\n";
			}

			var currentFaceString 	= "f ";			
			var startEdge 			= this._faces[currentFace]._edge;
			var currentEdge 		= this._faces[currentFace]._edge;
			var currentVert = 0;
			do
			{
				// Face string:
				currentFaceString += (currentEdge._vertOrigin._vertIndex + 1).toString(); // +1, as OBJ's use 1-based indexing

				currentFaceString += "/";

				// Append UVs:
				if (hasUVs)
				{
					currentFaceString += currentUVIndexStrings[currentVert];
				}
				currentFaceString += "/"

				// Append normals:
				currentFaceString += currentNormalIndex;
				currentNormalIndex++;

				// Append separator/new line:
				if (currentVert == 2)
				{
					currentFaceString += "\n";
				}
				else
				{
					currentFaceString += " ";
				}

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
				currentVert++;
			} while (currentEdge != startEdge)

			// Append results to output:
			faceSection += currentFaceString;
			uvSection += currentUVString;
			normalSection += currentNormalString;
		}

		return objText + uvSection + normalSection + faceSection;
	}


	// Helper function: Converts a value to string, and appends ".0" if it's an integer
	formatFloatValueForOBJOutput(value)
	{
		var result = value.toString();
		if(value % 1 == 0)
		{
			result += ".0";
		}
		return result;
	}

    
    // Initialize vertex buffers:
    initializeBuffers()
    {
		// (Re)Initialize the buffers we'll upload to WebGL:
		this._positionData 			= [];
		this._OBJNormalsData		= [];
		this._smoothNormalsData	 	= [];
		this._colorData				= [];
		this._wireframePositionsData = [];

		// Process each face in the windged-edge structure:
		var currentIndex = 0;
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			var currentEdge = this._faces[currentFace]._edge;

			// Process each vert for the current face:
			for (var currentVert = 0; currentVert < 3; currentVert++)
			{
				// Average the smoothed normal, if required:
				if (currentEdge._vertOrigin._adjacentFaces > 0)
				{
					var denominator = vec3.fromValues(currentEdge._vertOrigin._adjacentFaces, currentEdge._vertOrigin._adjacentFaces, currentEdge._vertOrigin._adjacentFaces);
					vec3.divide(currentEdge._vertOrigin._smoothedNormal, currentEdge._vertOrigin._smoothedNormal, denominator);

					vec3.normalize(currentEdge._vertOrigin._smoothedNormal, currentEdge._vertOrigin._smoothedNormal);
				}

				// Push the current vertex data, looping over the x, y, z coords:
				for (var currentElement = 0; currentElement < 3; currentElement++)
				{
					this._positionData.push(currentEdge._vertOrigin._position[currentElement]);

					this._wireframePositionsData.push(currentEdge._vertOrigin._position[currentElement]);

					this._OBJNormalsData.push( this._faces[currentFace]._normals[currentVert][currentElement] );

					this._smoothNormalsData.push(currentEdge._vertOrigin._smoothedNormal[currentElement]);

					// TODO: Handle UVs. For now, just push an arbitrary color
					this._colorData.push(0.75, 0.75, 0.75, 1.0);
				}
				
				// Duplicate the 1st vertex to complete close the line when rendering in wireframe mode
				if (currentVert == 2)
				{
					for (var currentElement = 0; currentElement < 3; currentElement++)
					{
						// this._wireframePositionsData.push(currentEdge._edgeLeftCCW._vertOrigin._position[currentElement]);
						this._wireframePositionsData.push(currentEdge._vertDest._position[currentElement]);
					}
				}

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
			}
		} // end face loop



        // Create and bind an array buffer for vertex positions:
        this._positionsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._positionsBuffer);

        // Buffer the vertex position data:
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._positionData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );

		this._wireframePositionsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._wireframePositionsBuffer);

        // Buffer the vertex position data:
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._wireframePositionsData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );


        // Create, bind, and buffer OBJ vertex normals:
        this._OBJNormalsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._OBJNormalsBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._OBJNormalsData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );

		// Create, bind, and buffer SMOOTH vertex normals:
		this._smoothNormalsBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this._smoothNormalsBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array(this._smoothNormalsData),  // Note: We must convert our JS array to a Float32Array
			gl.STATIC_DRAW
		);

        // Create, bind, and buffer vertex color data:
        this._colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._colorData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );

    }


    // Bind a mesh for rendering:
    bindBuffers(gl, bindWireframeVertexBuffers = false)
    {
        // Configure the vertex buffers:
		if (bindWireframeVertexBuffers == true)
		{
			gl.bindBuffer(gl.ARRAY_BUFFER, this._wireframePositionsBuffer);
		}
		else
		{
			gl.bindBuffer(gl.ARRAY_BUFFER, this._positionsBuffer);
		}
        
        gl.vertexAttribPointer(
            gl.getAttribLocation(this._material._shader._shaderProgram, 'in_position'),
            3,          // Number of components: # values per iteration
            gl.FLOAT,   // Type
            false,      // Normalize the data?
            0,          // Stride
            0           // Starting offset
        );
        gl.enableVertexAttribArray(gl.getAttribLocation(this._material._shader._shaderProgram, 'in_position'));

        // Bind the appropriate normal buffer:
		switch(this._shadingMode)
		{
			case NORMAL_TYPE.SMOOTH:
			{
				gl.bindBuffer(gl.ARRAY_BUFFER, this._smoothNormalsBuffer);
			}
			break;

			case SHADING_MODE.FLAT:
			case SHADING_MODE.WIREFRAME:
			case NORMAL_TYPE.OBJ_OR_FACE:
			default:
			{
				gl.bindBuffer(gl.ARRAY_BUFFER, this._OBJNormalsBuffer);
			}
		}

        gl.vertexAttribPointer(
            gl.getAttribLocation(this._material._shader._shaderProgram, 'in_normal'),
            3,          // Number of components: # values per iteration
            gl.FLOAT,   // Type
            false,      // Normalize the data?
            0,          // Stride
            0           // Starting offset
        );
        gl.enableVertexAttribArray(gl.getAttribLocation(this._material._shader._shaderProgram, 'in_normal'));

        // Color buffers:
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
        gl.vertexAttribPointer(
            gl.getAttribLocation(this._material._shader._shaderProgram, 'in_vertexColor'),
            4,          // Number of components: # values per iteration
            gl.FLOAT,   // Type
            false,      // Normalize the data?
            0,          // Stride
            0           // Starting offset
        );
        gl.enableVertexAttribArray(gl.getAttribLocation(this._material._shader._shaderProgram, 'in_vertexColor'));

    }
}