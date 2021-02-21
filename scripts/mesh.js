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

	_children		= null;	// For subdivision


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

	_vertexDegree 			= [];
	_vertexDegreeIsDirty 	= true;

    constructor()
    {

    }


	// Subdivision helper: Get the number of edges connected to a vertex
	getVertexDegree(vertexIndex)
	{
		if (this._vertexDegreeIsDirty == true)
		{
			this._vertexDegree = [];

			for (var currentRow = 0; currentRow < this._edges[0].length; currentRow++)
			{
				var currentCount = 0;
				for (var currentCol = 0; currentCol < this._edges[0].length; currentCol++)
				{
					if (this._edges[currentRow][currentCol] != null)	//  Note: _edges[currentRow][currentCol] == null
					{
						currentCount++;
					}
				}
				this._vertexDegree.push(currentCount);
			}

			this._vertexDegreeIsDirty = false;
		}

		return this._vertexDegree[vertexIndex];
	}


	// Subdivision helper: Get a list of references to vertex neighbors connected to a vertex with a specific index
	getVertexNeighbors(vertexIndex)
	{
		var neighbors = [];

		for (var currentVert = 0; currentVert < this._edges[0].length; currentVert++)
		{
			if (this._edges[vertexIndex][currentVert] != null)
			{
				// Handle bi-directional edges: Only push neighbors, not the target vertex:
				if(this._edges[vertexIndex][currentVert]._vertOrigin._vertIndex == vertexIndex)
				{
					neighbors.push(this._edges[vertexIndex][currentVert]._vertDest);
				}
				else
				{
					neighbors.push(this._edges[vertexIndex][currentVert]._vertOrigin);
				}
			}
		}
		
		return neighbors;
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

			this._vertexDegreeIsDirty = true;	// We only use this later during subdivison, but setting the flag here as a precaution
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


		// for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		// {
		// 	var startEdge = this._faces[currentFace]._edge;
		// 	var currentEdge = startEdge;
		// 	var count = 0;
		// 	do{
		// 		count++;
		// 		if (currentEdge._edgeRightCW == null)
		// 		{
		// 			console.log("FOUND IT");
		// 			console.log(currentEdge);
		// 		}
		// 		else console.log("OK");

		// 		// if (newEdges[][] === null)

		// 		currentEdge = currentEdge._edgeLeftCCW;

		// 	}while(currentEdge != startEdge);
		// 	if(count != 3) console.log("WRONG COUNT");
		// }
		



        // Finally, initialize the render object mesh's vertex buffers:
        this.initializeBuffers();
    }


	// Is a valid mesh loaded and ready to render?
	isInitialized()
	{
		return this._positionsBuffer != null;
	}


	subdivideMesh(subdivisionType, numberOfLevels)
	{
		if(!this.isInitialized())
		{
			console.log("[mesh][subdivideMesh] Must load a mesh before subdivision can be performed");
			return;
		}

		switch(subdivisionType)
		{
			case SUBDIVISION_TYPE.LOOP:
			{
				this.loopSubdivision(numberOfLevels);
			}
			break;

			case SUBDIVISION_TYPE.BUTTERFLY:
			{
				alert("Butterfly subdivision is not yet implemented. Please try Loop subdivision!");
			}
			break;

			default:
				console.log("[mesh][subdivideMesh] Invalid subdivision type received! " + subdivisionType);
		}
	}


	loopSubdivision(numberOfLevels)
	{
		this._vertexDegreeIsDirty = true;	// Mark the vertex degree count as dirty to ensure we recalculate the degrees

		// Count the number of edges in the current mesh:
		var totalEdges = 0;
		for (var currentRow = 0; currentRow < this._edges[0].length; currentRow++)
		{
			for (var currentCol = 0; currentCol < this._edges[0].length; currentCol++)
			{
				if (this._edges[currentRow][currentCol] != null)
				{
					totalEdges++;
				}
			}
		}

		if (totalEdges % 2 != 0)
		{
			console.log("ERROR! Found odd number of edges!!!")
		}

		totalEdges /= 2; // Edges are bi-directional, so we must halve the count

		// Calculate the number of vertices in the subdivided mesh:
		var newTotalVerts = this._vertices.length + totalEdges;

		// Create new winged-edge structures:
		var newVerts = [];
		for (var currentVert = 0; currentVert < newTotalVerts; currentVert++)
		{
			newVerts.push(null);
		}

		// 2D edge table:
		var newEdges = [];
		for (var currentRow = 0; currentRow < newTotalVerts; currentRow++)
		{
			newEdges.push(new Array());
			for (var currentCol = 0; currentCol < newTotalVerts; currentCol++)
			{
				newEdges[currentRow].push(null);
			}
		}

		var newFaces = [];

		// Add transformed copies of original verts to the new table:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{
			var currentDegree = this.getVertexDegree(currentVert);

			if (currentDegree < 3)
			{
				console.log("[mesh][loopSubdivision] ERROR: Found a vertex with degree < 3");
				return;
			}

			var beta 			= (1.0 / currentDegree) * (FIVE_OVER_EIGHT - Math.pow(THREE_OVER_EIGHT + ONE_OVER_FOUR * Math.cos(TWO_PI / currentDegree), 2));
			var oneMinusNBeta 	=  1.0 - (currentDegree * beta);

			var neighborVerts = this.getVertexNeighbors(currentVert);

			if (currentDegree != neighborVerts.length) // DEBUG DELME!!!!
			{
				console.log("ERROR: Degree should match the number of neighbors!!!!!!");
			}

			// Apply the vertex rule at the neighbors:
			var sumPositions = vec3.create();
			for (var currentNeighbor = 0; currentNeighbor < neighborVerts.length; currentNeighbor++)
			{
				vec3.add(sumPositions, sumPositions, neighborVerts[currentNeighbor]._position);
			}
			vec3.scale(sumPositions, sumPositions, beta);

			// Apply the vertex rule at the current vertex:
			var scaledCurrentPosition = vec3.create();
			vec3.scale(scaledCurrentPosition, this._vertices[currentVert]._position, oneMinusNBeta);

			// Combine the weighted neighbor and current vertex positions:
			vec3.add(scaledCurrentPosition, scaledCurrentPosition, sumPositions);

			var replacementVert = new vertex(
				scaledCurrentPosition[0],
				scaledCurrentPosition[1],
				scaledCurrentPosition[2],
				this._vertices[currentVert]._vertIndex
			);

			// Finally, add the replacement vert to our new vertex array:
			newVerts[currentVert] = replacementVert;
		}
		


		// Track which first empty index of the new vertex table we're inserting into
		var nextNewVertIndex = this._vertices.length;	


		// for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		// {
		// 	var startEdge = this._faces[currentFace]._edge;
		// 	var currentEdge = startEdge;
		// 	var count = 0;
		// 	do{
		// 		count++;
		// 		if (currentEdge._edgeRightCW == null)
		// 		{
		// 			console.log("FOUND IT");
		// 			console.log(currentEdge);
		// 		}
		// 		else console.log("OK");

		// 		// if (newEdges[][] === null)

		// 		currentEdge = currentEdge._edgeLeftCCW;

		// 	}while(currentEdge != startEdge);
		// 	if(count != 3) console.log("WRONG COUNT");
		// }



		// Subdivide existing edges of each face:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{

			
			// var startEdge = this._faces[currentFace];
			// var currentEdge = startEdge;
			// var count = 0;
			// do{
			// 	count++;
			// 	if (currentEdge._edgeRightCW == null)
			// 	{
			// 		console.log("FOUND IT");
			// 	}
			// 	else console.log("OK");

			// 	// if (newEdges[][] === null)

			// 	currentEdge = currentEdge._edgeLeftCCW;

			// }while(currentEdge != startEdge);
			// if(count != 3) console.log("WRONG COUNT");


			// Traverse the edges of the face:
			var startEdge 	= this._faces[currentFace]._edge;
			var currentEdge = startEdge;
			do
			{
				// Skip edges that have already been processed when handling another face:
				if (currentEdge._children != null)
				{
					// Prepare for the next iteration:
					currentEdge = currentEdge._edgeLeftCCW;

					continue;
				}

				// Apply the edge rule to the start/end verts:
				var scaledStartEndPositions = vec3.create();
				vec3.add(scaledStartEndPositions, currentEdge._vertOrigin._position, currentEdge._vertDest._position);
				vec3.scale(scaledStartEndPositions, scaledStartEndPositions, THREE_OVER_EIGHT);

				console.log(currentEdge);
				console.log(currentEdge._edgeRightCW);	 // problem: edgeRightCW pointer is null

				// Apply the edge rule to the "side" verts:
				var scaledSideVerts = vec3.create();
				vec3.add(scaledSideVerts, currentEdge._edgeLeftCCW._vertDest._position, currentEdge._edgeRightCW._vertDest._position);
				vec3.scale(scaledSideVerts, scaledSideVerts, ONE_OVER_EIGHT);

				// Construct the new vertex position:
				var newVertPosition = vec3.create();
				vec3.add(newVertPosition, scaledStartEndPositions, scaledSideVerts);

				// Construct the new vertex:
				var newVert = new vertex(
					newVertPosition[0],
					newVertPosition[1],
					newVertPosition[2],
					nextNewVertIndex
				);

				// Add the new vertex to the new vertex array:
				newVerts[nextNewVertIndex] = newVert;		
				
				nextNewVertIndex++; // Increment for the next vertex we'll add


				// Construct the new sub-edges, and add them to the new edges list:
				var edge1 = new edge(
					newVerts[currentEdge._vertOrigin._vertIndex], 
					newVert
					);
				newEdges[currentEdge._vertOrigin._vertIndex][newVert._vertIndex] = edge1;

				var edge1Inverse = new edge(
					newVert,
					newVerts[currentEdge._vertOrigin._vertIndex]
					);
				newEdges[newVert._vertIndex][currentEdge._vertOrigin._vertIndex] = edge1Inverse;

				var edge2 = new edge(
					newVert,
					newVerts[currentEdge._vertDest._vertIndex]					
					);
				newEdges[newVert._vertIndex][currentEdge._vertDest._vertIndex] = edge2;

				var edge2Inverse = new edge(
					newVerts[currentEdge._vertDest._vertIndex],
					newVert					
					);
				newEdges[currentEdge._vertDest._vertIndex][newVert._vertIndex] = edge2Inverse;

				// Update new vertex's vert -> edge pointer:
				newVert._edge = edge2;	// Origin vertex of edge2

				// Get a pointer to the inverse of the current edge:
				var inverseCurrentEdge = this._edges[currentEdge._vertDest._vertIndex][currentEdge._vertOrigin._vertIndex];
				
				// Add pointers to the child edges (in CCW order) so we can find them later:
				currentEdge._children 			= [edge1, edge2];
				inverseCurrentEdge._children 	= [edge2Inverse, edge1Inverse];
				

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
			} while (currentEdge != startEdge);
		}


		// Connect the new sub-edges to create new sub-triangle faces:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			// Cache the internal edges so we can construct the inner sub-triangle:
			var createdEdges 		= [];
			var createdInverseEdges = [];

			// Traverse the edges of the face:
			var startEdge 	= this._faces[currentFace]._edge;
			var currentEdge = startEdge;
			do
			{
				// Create corner triangle for the current face:
				var prevEdge 		= currentEdge._edgeLeftCW;
				var prevNewVert 	= prevEdge._children[1]._vertOrigin;

				var currentNewVert 	= currentEdge._children[0]._vertDest;

				var newFace 	= new face();
				newFace._edge 	= currentEdge._children[0];
				newFaces.push(newFace);

				// Create the internal connecting edge and its inverse, and add them to the edge table:
				var newEdge = new edge(
					currentNewVert,
					prevNewVert
				);
				newEdges[currentNewVert._vertIndex][prevNewVert._vertIndex] = newEdge;

				var inverseNewEdge = new edge(
					prevNewVert,
					currentNewVert					
				);
				newEdges[prevNewVert._vertIndex][currentNewVert._vertIndex] = inverseNewEdge;

				// Cache the pointers to the new edges so we can create the internal face later:
				createdEdges.push(newEdge);
				createdInverseEdges.push(inverseNewEdge);

				// Link the left face edge pointers:
				prevEdge._children[1]._edgeLeftCCW 		= currentEdge._children[0];	// next/prev w.r.t CCW
				currentEdge._children[0]._edgeLeftCCW 	= newEdge;
				newEdge._edgeLeftCCW 					= prevEdge._children[1];

				prevEdge._children[1]._edgeLeftCW 		= newEdge;
				currentEdge._children[0]._edgeLeftCW 	= prevEdge._children[1];
				newEdge._edgeLeftCW 					= currentEdge._children[0];

				// Link the inverse edge right pointers:
				var inverseCurrentEdge 	= this._edges[currentEdge._vertDest._vertIndex][currentEdge._vertOrigin._vertIndex];
				var inverseNextEdge 	= inverseCurrentEdge._edgeRightCW;

				inverseCurrentEdge._children[1]._edgeRightCCW 	= inverseNewEdge;
				inverseNextEdge._children[0]._edgeRightCCW 		= inverseCurrentEdge._children[1];
				inverseNewEdge._edgeRightCCW					= inverseNextEdge._children[0];

				inverseCurrentEdge._children[1]._edgeRightCW 	= inverseNextEdge._children[0];
				inverseNextEdge._children[0]._edgeRightCW 		= inverseNewEdge;
				inverseNewEdge._edgeRightCW 					= inverseCurrentEdge._children[1];

				// Link the left face pointers:
				prevEdge._children[1]._faceLeft 	= newFace;
				newEdge._faceLeft 					= newFace;
				currentEdge._children[0]._faceLeft 	= newFace;

				// Link the right face pointers for each edge of the new sub-triangle, if we can:
				// if(newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._faceLeft != null )
				{
					// Check the inverses of the edges of the new sub-triangle:
					newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._faceRight = newFace;
					prevEdge._children[1]._faceRight = newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._faceLeft;

					// Update right edge pointers:
					newEdges[prevNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._edgeRightCW 	= newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._edgeLeftCW;
					newEdges[prevNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._edgeRightCCW 	= newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._edgeLeftCCW;
				}

				// if (newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._faceLeft != null)
				{
					newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._faceRight = newFace;
					currentEdge._children[0]._faceRight = newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._faceLeft;

					// Update right edge pointers:
					newEdges[currentEdge._vertOrigin._vertIndex][currentNewVert._vertIndex]._edgeRightCW 	= newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._edgeLeftCW;
					newEdges[currentEdge._vertOrigin._vertIndex][currentNewVert._vertIndex]._edgeRightCCW 	= newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._edgeLeftCCW;
				}

				// TEMP HACK: COPY THE CURRENT FACE NORMALS TO THE SUB-FACE. TODO: HANDLE THIS CORRECTLY!!!!!!!!!!!!!!
				newFace._normals	= this._faces[currentFace]._normals;
				newFace._faceNormal = this._faces[currentFace]._faceNormal;
				newFace._uvs 		= this._faces[currentFace]._uvs;


				// if (newEdge._edgeRightCW === null) console.log("GOTCHA");
				// else console.log("ITS OK");
				// console.log(currentEdge);
				// console.log(currentEdge._edgeRightCW);

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;

				

			} while (currentEdge != startEdge);


			// Finally, create the inner face:
			var newFace 	= new face();
			newFace._edge 	= createdInverseEdges[0];
		

			for (var currentEdge = 0; currentEdge < createdInverseEdges.length; currentEdge++)
			{
				createdEdges[currentEdge]._faceRight 		= newFace;
				createdInverseEdges[currentEdge]._faceLeft 	= newFace;

				var nextEdgeIndex	= (currentEdge + 1) % 3;	// next/prev w.r.t CCW
				var prevEdgeIndex	= currentEdge == 0 ? 2 : ((currentEdge - 1) % 3);

				createdInverseEdges[currentEdge]._edgeLeftCCW 	= createdInverseEdges[nextEdgeIndex];
				createdInverseEdges[currentEdge]._edgeLeftCW 	= createdInverseEdges[prevEdgeIndex];

				var originVertIndex = createdInverseEdges[currentEdge]._vertOrigin._vertIndex;
				var destVertIndex 	= createdInverseEdges[currentEdge]._vertDest._vertIndex;

				createdInverseEdges[currentEdge]._edgeRightCCW 	= newEdges[destVertIndex][originVertIndex]._edgeLeftCW;
				createdInverseEdges[currentEdge]._edgeRightCW 	= newEdges[destVertIndex][originVertIndex]._edgeLeftCCW;

				
				createdEdges[currentEdge]._edgeRightCW 	= createdInverseEdges[prevEdgeIndex];
				createdEdges[currentEdge]._edgeRightCCW = createdInverseEdges[destVertIndex];

				

				if (createdInverseEdges[currentEdge]._edgeLeftCCW === null ||
					createdInverseEdges[currentEdge]._edgeLeftCW === null
					) 
					console.log("GOTCHA!!!!!!!!!!!!!!!!!");
			}

			var startEdge = newFace._edge;
			var currentEdge = startEdge;
			var count = 0;
			do{
				count++;
				if (currentEdge._edgeRightCW == null)
				{
					console.log("FOUND IT");
				}
				else console.log("OK");

				// if (newEdges[][] === null)

				currentEdge = currentEdge._edgeLeftCCW;

			}while(currentEdge != startEdge);
			if(count != 3) console.log("WRONG COUNT");

			// TEMP HACK: COPY THE CURRENT FACE NORMALS TO THE SUB-FACE. TODO: HANDLE THIS CORRECTLY!!!!!!!!!!!!!!
			newFace._normals	= this._faces[currentFace]._normals;
			newFace._faceNormal = this._faces[currentFace]._faceNormal;
			newFace._uvs 		= this._faces[currentFace]._uvs;


			newFaces.push(newFace);

		} // end faces loop


		// for (var currentFace = 0; currentFace < newFaces.length; currentFace++)
		// {
		// 	// Traverse the edges of the face:
		// 	var startEdge 	= newFaces[currentFace]._edge;
		// 	var currentEdge = startEdge;
		// 	var count = 0;
		// 	do
		// 	{
		// 		count++;
		// 		if (currentEdge._vertDest._vertIndex != currentEdge._edgeLeftCCW._vertOrigin._vertIndex)
		// 		{
		// 			console.log("BAD!!!");
		// 		}
		// 		else console.log("GOOD");

		// 		currentEdge = currentEdge._edgeLeftCCW;
		// 	} while(currentEdge != startEdge);
		// 	if(count!=3) console.log("BAD COUNT");
		// }


		console.log(newVerts);
		console.log(newEdges);
		console.log(newFaces);


		this._faces 	= newFaces;
		this._edges 	= newEdges;
		this._vertices 	= newVerts;

		// Finally, re-initialize the render object mesh's vertex buffers:
        this.initializeBuffers();

		// TODO: 
		// SOLVE MISSING POINTERS
		// HANDLE FACE + SMOOTH NORMALS
		// IMPLEMENT MULTIPLE ITERATIONS
		// OUTPUT OBJ NORMALS BASED ON CURRENT SHADING MODE
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
		if (this._positionsBuffer != null)
		{
			gl.deleteBuffer(this._positionsBuffer);
			gl.deleteBuffer(this._wireframePositionsBuffer);
			gl.deleteBuffer(this._OBJNormalsBuffer);
			gl.deleteBuffer(this._smoothNormalsBuffer);
			gl.deleteBuffer(this._colorBuffer);
		}

		// (Re)Initialize the buffers we'll upload to WebGL:
		this._positionData 				= [];
		this._OBJNormalsData			= [];
		this._smoothNormalsData	 		= [];
		this._colorData					= [];
		this._wireframePositionsData 	= [];

		// Process each face in the windged-edge structure:
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

				// Push the current origin vertex, looping over the x, y, z coords:
				for (var currentElement = 0; currentElement < 3; currentElement++)
				{
					this._positionData.push(currentEdge._vertOrigin._position[currentElement]);

					this._wireframePositionsData.push(currentEdge._vertOrigin._position[currentElement]);

					this._OBJNormalsData.push( this._faces[currentFace]._normals[currentVert][currentElement] );

					this._smoothNormalsData.push(currentEdge._vertOrigin._smoothedNormal[currentElement]);

					// TODO: Handle UVs. For now, just push an arbitrary color
					this._colorData.push(0.75, 0.75, 0.75, 1.0);
				}

				// Also push the destination vertex to the wireframe buffer, as we require 2 points per line when using gl.LINES mode:
				for (var currentElement = 0; currentElement < 3; currentElement++)
				{
					this._wireframePositionsData.push(currentEdge._vertDest._position[currentElement]);
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