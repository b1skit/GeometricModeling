// mesh object: Geometry contained by a renderObject

// CMPT 764 Assignment 1/2
// by Adam Badke
// SFU Student #301310785
// abadke@sfu.ca


// Mesh debugging:
// 'use strict';
var DEBUG_ENABLED 		= false;
var DEBUG_SPECIFY_EDGES = false;
var debugEdgeIndex = 0;
var debugEdgeVerts = 
[
	[7,6],
	[3,2],

];
var DEBUG_EDGE_SEQUENCE = "";
var DEBUG_ERROR_HAS_OCCURRED = false;



/*  Face class
*
*/
class face
{
	// Vertex attributes for the current face:
	_normals 		= [];	// Per-vertex normals
	_uvs			= [];

	_faceNormal		= null;	// Single face normal

    // Winged-edge adjacency references:
    _edge  			= null;
	_faceIndex		= -1;

	// Error quadrics for mesh decimation:
	_errorQuadric	= null;

    constructor()
    {

    }

	
	// Compute the face normal for this face. Call this once the face is otherwise fully initialized
	computeFaceNormal(hasNormal)
	{
		var v1 = vec3.create();				
		vec3.subtract(v1, this._edge._vertOrigin._position, this._edge._vertDest._position);
		vec3.normalize(v1, v1);

		var v2 = vec3.create();				
		vec3.subtract(v2, this._edge._edgeLeftCCW._vertDest._position, this._edge._vertDest._position);
		vec3.normalize(v2, v2);

		this._faceNormal = vec3.create();
		vec3.cross(this._faceNormal, v2, v1);
		vec3.normalize(this._faceNormal, this._faceNormal);

		// If no normals were received in the source OBJ, use the face normal instead:
		if (!hasNormal)
		{
			this._normals = [];	// Reinitialize to ensure we only ever have 3 elements

			this._normals.push(this._faceNormal);	// We push it 3 times (once for each vertex)
			this._normals.push(this._faceNormal);
			this._normals.push(this._faceNormal);
		}
	}


	// Compute the error quadric for the face:
	computeErrorQuadric()
	{
		if (this._faceNormal == null)
		{
			console.log("[mesh][face][computeErrorQuadric] Error: Mesh has no face normal, but should have one!");
		}

		const a = this._faceNormal[0];
		const b = this._faceNormal[1];
		const c = this._faceNormal[2];

		// Compute d to satisfy the plane equation:
		const referenceVertPos = this._edge._vertOrigin._position;
		const d = -(this._faceNormal[0] * referenceVertPos[0]) - (this._faceNormal[1] * referenceVertPos[1]) - (this._faceNormal[2] * referenceVertPos[2]);

		this._errorQuadric = mat4.fromValues(
			a * a,	// Col 0
			a * b,
			a * c,
			a * d,

			b * a,	// Col 1
			b * b,
			b * c,
			b * d,

			c * a,	// Col 2
			c * b,
			c * c,
			c * d,

			d * a,	// Col 3
			d * b,
			d * c,
			d * d,
		);	// TODO: Error quadrics are symmetric: We only need to store 10 values instead of a 4x4 here...
	}
}


/*  Vertex class
*
*/
class vertex
{
    // Vertex properties:
    _position   	= null;	// vec3
	
	// Smoothed normals:
	_smoothedNormal = null;	// vec3
	_adjacentFaces 	= 0;	// Used to average the neighboring face normals

    // Winged-edge adjacency references:
    _edge       	= null;
	_vertIndex 		= -1;	// The index of the mesh._vertices array that this vertex is stored in. Used for efficient OBJ output

	// Error quadrics for mesh decimation:
	_errorQuadric	= null;


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


	// Set a vertex's error quadric to 0:
	initializeErrorQuadric()
	{
		this._errorQuadric = mat4.fromValues(
			0, 0, 0, 0, 
			0, 0, 0, 0, 
			0, 0, 0, 0, 
			0, 0, 0, 0
			);
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

	_edgeLeftCCW    = null;	// The "next" edge in CCW order
    _edgeLeftCW     = null;	// The "previous" edge in CCW order
    

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
	
	_shadingMode 				= SHADING_MODE.SHADED_WIREFRAME;

    // Winged-edge structure:
    _faces      = null;
    _edges      = null;		// 2D table
    _vertices   = null;

	_vertexDegree 				= [];
	_vertexDegreesAreDirty 		= true;

	_numEdgesIsDirty 			= true;
	_numEdges 					= -1;
	_condensedEdgeList 			= null;				// Condensed list of edges. Computed during getRandomEdges() call

	_errorQuadricsAreComputed 	= false;

    constructor()
    {

    }


	// Get the number of edges in the mesh
	// Only returns 1-way edges
	getNum1WayEdges()
	{
		if (this._numEdgesIsDirty)
		{
			this._numEdges = 0; 
			for(var currentStartVert = 0; currentStartVert < this._edges[0].length; currentStartVert++)
			{
				for (var currentEndVert = (currentStartVert + 1); currentEndVert < this._edges[0].length; currentEndVert++)
				{
					if (this._edges[currentStartVert][currentEndVert] != null)
					{
						this._numEdges++;
					}
				}
			}

			this._numEdgesIsDirty  = false;
		}

		return this._numEdges;
	}


	// Helper function: Get the inverse of an edge
	getInverseEdge(currentEdge)
	{
		if (DEBUG_ENABLED)
		{
			if (currentEdge == null)
			{
				console.log("[mesh][getInverseEdge] ERROR: Received a null edge!");
			}

			if (currentEdge._vertOrigin == null || currentEdge._vertDest == null)
			{
				console.log("[mesh][getInverseEdge] ERROR: Received an edge with a null vertex");
				console.log(currentEdge);
			}
			else if (this._edges[currentEdge._vertOrigin._vertIndex][currentEdge._vertDest._vertIndex] == null)
			{
				console.log("[mesh][getInverseEdge] ERROR: Edge table is null at the location of the received edge: " + currentEdge._vertOrigin._vertIndex + " -> " + currentEdge._vertDest._vertIndex);
			} 
		}		

		return this._edges[currentEdge._vertDest._vertIndex][currentEdge._vertOrigin._vertIndex];
	}


	// Decimation helper: Count the current degree via the edge table
	countVertexDegree(vertexIndex)
	{
		var currentCount = 0;
		for (var currentCol = 0; currentCol < this._edges[0].length; currentCol++)
		{
			if (this._edges[vertexIndex][currentCol] != null)
			{
				currentCount++;
			}			
		}
		return currentCount;
	}


	// Subdivision helper: Get the number of edges connected to a vertex
	getVertexDegree(vertexIndex)
	{
		// Recompute all vertex degrees, if required:
		if (this._vertexDegreesAreDirty == true)
		{
			this._vertexDegree = [];

			// Process each row in the edge table (one row per vertex):
			for (var currentRow = 0; currentRow < this._edges[0].length; currentRow++)
			{
				// Count the number of non-null entries in the row (each a neighbor of the vertex represented by the current row):
				var currentCount = 0;
				for (var currentCol = 0; currentCol < this._edges[0].length; currentCol++)
				{
					if (this._edges[currentRow][currentCol] != null)	//  Note: _edges[currentRow][currentCol] == null
					{
						currentCount++;
					}
				}
				this._vertexDegree.push(currentCount);	// Each element of this array holds the neighbor count of the vertex sharing the same index
			}

			this._vertexDegreesAreDirty = false;
		}

		return this._vertexDegree[vertexIndex];
	}


	// Helper function: Get a list of references to vertex neighbors connected to a vertex with a specific index
	// Returns a list of vertices connected to edges starting at the received vertexIndex
	getVertexNeighbors(vertexIndex)
	{
		var neighbors = [];

		for (var currentVert = 0; currentVert < this._edges[0].length; currentVert++)
		{
			// Walk the vertexIndex row: Check edges starting at the received vertexIndex -> neighbor:
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

			this._vertexDegreesAreDirty = true;	// We only use this later during subdivison, but setting the flag here as a precaution
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

			// Mark the edges table as dirty:
			this._numEdgesIsDirty = true;
		}

		return this._edges[originVertIndex][destVertIndex];
	}


	// Add a face to the mesh. Updates its internal index
	addFace(newFace)
	{
		newFace._faceIndex = this._faces.length;
		this._faces.push(newFace);
	}


    // Load data received from an .obj file into our mesh:
    constructMeshFromOBJData(objData)
    {
        console.log("[mesh][constructMeshFromOBJData] Constructing mesh from obj data...");

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
				var nextEdgeIndex	= (currentEdge + 1) % 3;
				var prevEdgeIndex	= currentEdge == 0 ? 2 : ((currentEdge - 1) % 3);

				// Current edge: CW, CCW:
				newFaceEdges[currentEdge]._edgeLeftCCW 	= newFaceEdges[nextEdgeIndex];
				newFaceEdges[currentEdge]._edgeLeftCW 	= newFaceEdges[prevEdgeIndex];
			}

			// Now that we have our final edges, update the face -> edge pointer
			newFace._edge 	= newFaceEdges[0];

			// Now that we've set the edges, compute the face normal:
			newFace.computeFaceNormal(hasNormal);
			
			this.addFace(newFace);

        }	// end face parsing

		// Compute the smooth normals:
		this.computeSmoothNormals();

		console.log("[mesh::constructMeshFromOBJData] Extracted " + this._vertices.length + " vertices, " + (this._faces.length * 3) + " (bi-directional) edges, " + this._faces.length + " faces to the winged data structure");

        // Finally, initialize the render object mesh's vertex buffers:
        this.initializeBuffers();
    }


	// Compute smooth/averaged normals for a loaded mesh:
	computeSmoothNormals()
	{
		// Initialize the verts adjacent faces counter:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{
			this._vertices[currentVert]._adjacentFaces = 0;
		}

		// Sum the neighboring face normals:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			var currentEdge = this._faces[currentFace]._edge;
			for (var currentVert = 0; currentVert < 3; currentVert++)
			{
				vec3.add(currentEdge._vertOrigin._smoothedNormal, currentEdge._vertOrigin._smoothedNormal, currentEdge._faceLeft._faceNormal);
				currentEdge._vertOrigin._adjacentFaces++;

				currentEdge = currentEdge._edgeLeftCCW;
			}
		}

		// Average the results:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{
			if (this._vertices[currentVert._adjacentFaces > 0])
			{
				var denominator = vec3.fromValues(this._vertices[currentVert]._adjacentFaces, this._vertices[currentVert]._adjacentFaces, this._vertices[currentVert]._adjacentFaces);
				vec3.divide(this._vertices[currentVert]._smoothedNormal, this._vertices[currentVert]._smoothedNormal, denominator);

				vec3.normalize(this._vertices[currentVert]._smoothedNormal, this._vertices[currentVert]._smoothedNormal);
			}
		}
	}


	// Is a valid mesh loaded and ready to render?
	isInitialized()
	{
		return this._positionsBuffer != null;
	}


	// Initialize the mesh's faces with an error quadric:
	computeFaceAndVertexQuadrics(force = false)
	{
		if (this._errorQuadricsAreComputed == true && !force)
		{
			return;
		}

		// (Re)Initialize the vertex quadrics:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{
			this._vertices[currentVert].initializeErrorQuadric();	// Sets mat4 error quadric full of 0's
		}

		// Compute the face quadric:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			this._faces[currentFace].computeErrorQuadric();

			// Add the plane information to the vertex quadrics:
			var currentEdge = this._faces[currentFace]._edge;
			for (var currentVert = 0; currentVert < 3; currentVert++)
			{
				mat4.add(currentEdge._vertOrigin._errorQuadric, currentEdge._vertOrigin._errorQuadric, this._faces[currentFace]._errorQuadric);

				currentEdge = currentEdge._edgeLeftCCW;
			}
		}

		this._errorQuadricsAreComputed = true;
	}


	// Get a random (stratified) edge
	getRandomEdge(currentCandidate, numCandidates)
	{
		// Build a list of all edges the first time this function is called:
		if (currentCandidate == 0)
		{
			this._condensedEdgeList = [];

			for (var row = 0; row < this._edges[0].length; row++)
			{
				for (var col = 0; col < this._edges[0].length; col++)
				{
					if (this._edges[row][col] != null)
					{
						this._condensedEdgeList.push(this._edges[row][col]);
					}
				}
			}
		}

		// STRATIFIED:
		const totalEdges 		= this._condensedEdgeList.length;
		var stratumWidth 		= totalEdges / numCandidates;	// 1.0/numCandidates * totalEdges
		var stratumStartIndex 	= stratumWidth * currentCandidate;
		var selectedIndex 		= stratumStartIndex + (Math.random() * stratumWidth);	// random returns values in [0, 1)
		selectedIndex 			= Math.min(Math.round(selectedIndex), totalEdges - 1);	// Ensure we don't go out of bounds


		// NON-STRATIFIED:
		// const totalEdges 		= this._condensedEdgeList.length;
		// var selectedIndex 		= (Math.random() * totalEdges);	// random returns values in [0, 1)
		// selectedIndex 			= Math.min(Math.round(selectedIndex), totalEdges - 1);	// Ensure we don't go out of bounds


		var searchedEdges = 0;
		while (
			this._condensedEdgeList[selectedIndex] == null || 
			this._edges[this._condensedEdgeList[selectedIndex]._vertOrigin._vertIndex][this._condensedEdgeList[selectedIndex]._vertDest._vertIndex] == null)
		{
			selectedIndex = (selectedIndex + 1) % this._condensedEdgeList.length;	// Wrap the index around

			searchedEdges++;
			if (searchedEdges > this._condensedEdgeList.length)
			{
				console.log("[mesh][getStratifiedEdge]ERROR: Condensed edge list is empty, cannot retrieve a random edge!");
				break;
			}
		}

		var selectedEdge 						= this._condensedEdgeList[selectedIndex];
		this._condensedEdgeList[selectedIndex] 	= null; // Remove the edge from the list

		// console.log("selectedIndex = " + selectedIndex + " / " + this._condensedEdgeList.length);

		if (DEBUG_ENABLED && DEBUG_SPECIFY_EDGES)
		{
			return this._edges[ debugEdgeVerts[debugEdgeIndex][0] ][ debugEdgeVerts[debugEdgeIndex++][1] ];
		}
		else
		{
			return selectedEdge;
		}
	}


	// Helper function: Check if an collapsing an 
	checkForFlippedNormal(candidateEdge, candidatePosition)
	{
		var v1 = vec3.create();				
		vec3.subtract(v1, candidateEdge._vertOrigin._position, candidatePosition);
		vec3.normalize(v1, v1);

		var v2 = vec3.create();				
		vec3.subtract(v2, candidatePosition, candidateEdge._edgeLeftCCW._vertDest._position);
		vec3.normalize(v2, v2);

		var newNormalLeft = vec3.create();
		vec3.cross(newNormalLeft, v2, v1);	// NOTE: Not normalized!

		var v3 = vec3.create();				
		vec3.subtract(v3, candidateEdge._vertOrigin._position,candidatePosition);
		vec3.normalize(v3, v3);

		var v4 = vec3.create();				
		vec3.subtract(v4, this.getInverseEdge(candidateEdge)._edgeLeftCCW._vertDest._position, candidateEdge._vertOrigin._position);
		vec3.normalize(v4, v4);

		var newNormalRight = vec3.create();
		vec3.cross(newNormalRight, v4, v3);	// NOTE: Not normalized!

		return (vec3.dot(newNormalRight, candidateEdge._faceRight._faceNormal) > 0 &&
				vec3.dot(newNormalLeft, candidateEdge._faceLeft._faceNormal) > 0
		);

	}


	// Decimate the mesh
	decimateMesh(numEdges, k)
	{
		if(!this.isInitialized())
		{
			alert("[mesh][decimateMesh] Error: You must load a mesh before decimation can be performed");
			return;
		}

		if (numEdges <= 0)
		{
			alert("[mesh][decimateMesh] Error: " + numEdges + " is not a valid number of edges to decimate.");
			return;
		}

		// Prevent decimation if it will result in a mesh that is not a connected, manifold triangle mesh. 
		var currentEdgeCount = this.getNum1WayEdges();
		if (numEdges > currentEdgeCount)	// Ensure we always have at least 6 edges, to guarantee a triangular pyramid
		{
			alert("[mesh][decimateMesh] Error: Attempting to demimate too many edges. The current mesh only has " + currentEdgeCount + " edges.");
			return;
		}

		if (DEBUG_ENABLED)
		{
			console.log("[mesh][decimateMesh] Decimation starting with " + currentEdgeCount + " edges");
			this.validateMesh();

			if (DEBUG_SPECIFY_EDGES)
			{
				k = 1;	// Only want to consider a single edge from our manually-specified edge list...
			}
		}


		// Initialize the error planes for the mesh:
		this.computeFaceAndVertexQuadrics();	// Note: This only actually computes once at the beginning

		var DEBUG_EDGE_SEQUENCE = "";	// DEBUG: Keep a track of the edge sequence so we can reconstruct it
		
		// Loop once for each edge to be removed:
		for (var currentEdgeNum = 0; currentEdgeNum < numEdges; currentEdgeNum++)
		{
			if (currentEdgeCount <= 6)
			{
				console.log("[mesh][decimateMesh] WARNING: There are only " + currentEdgeCount + " edges in the mesh. Aborting decimation");
				break;
			}

			if (DEBUG_ENABLED)
			{
				console.log("Mesh currently has " + currentEdgeCount + " edges");

				if (DEBUG_ERROR_HAS_OCCURRED)
				{
					console.log(DEBUG_EDGE_SEQUENCE);
					break;
				}
			}

			this._vertexDegreesAreDirty 	= true;		// Mark the vertex degree count as dirty to ensure we recalculate the degrees
			this._numEdgesIsDirty 			= true;		// Mark the edges table as dirty

			// Maintain the best candidate seen so far:
			var selectedEdge 			= null;
			var selectedEdgeError 		= Infinity;
			var collapsedVertexPosition = null;

			// Consider k random edges:
			for (var currentCandidate = 0; currentCandidate < k; currentCandidate++)
			{
				// Select a stratified edge for consideration:
				var candidateEdge = this.getRandomEdge(currentCandidate, k);

				if(candidateEdge == null)
				{
					console.log("[mesh][decimateMesh] Error: Received a null candidate edge... Aborting decimation");
					break;
				}

				// Compute the optimized location for an edge collapse:
				var combinedVertQuadrics = mat4.create();
				mat4.add(combinedVertQuadrics, candidateEdge._vertOrigin._errorQuadric, candidateEdge._vertDest._errorQuadric);

				// Zero out the bottom row:
				combinedVertQuadrics[3] 	= 0;
				combinedVertQuadrics[7] 	= 0;
				combinedVertQuadrics[11] 	= 0;
				combinedVertQuadrics[15] 	= 1;
				
				// Invert:
				var combinedVertQuadricsInv 	= mat4.invert(combinedVertQuadrics, combinedVertQuadrics);

				var candidateCollapsedPosition;

				// If the matrix is invertible, compute the ideal reprojection location:
				if (combinedVertQuadricsInv != null)
				{
					// Compute the contracted position with minimal error: (Q1 + Q2)(^-1) * [0,0,0,1]
					candidateCollapsedPosition = vec4.fromValues(combinedVertQuadricsInv[12], combinedVertQuadricsInv[13], combinedVertQuadricsInv[14], combinedVertQuadricsInv[15] );
				}
				else
				{
					// Matrix was not invertible: Fallback to the midpoint:
					candidateCollapsedPosition = vec4.fromValues(
						candidateEdge._vertOrigin._position[0] + candidateEdge._vertDest._position[0], 
						candidateEdge._vertOrigin._position[1] + candidateEdge._vertDest._position[1], 
						candidateEdge._vertOrigin._position[2] + candidateEdge._vertDest._position[2], 
						2.0	// Will be 1.0 after we apply the 0.5 scale!
						);

					vec4.scale(candidateCollapsedPosition, candidateCollapsedPosition, 0.5);
				}


				// Ensure the collapsed position doesn't result in a normal flip:
				var isFlipped = this.checkForFlippedNormal(candidateEdge, candidateCollapsedPosition);
				if (isFlipped)
				{
					currentCandidate--;
					continue;
				}

				if (!isFlipped)
				{
					// Compute the error of the contracted position:
					var result = vec4.create();

					// Q * v:
					vec4.transformMat4(result, candidateCollapsedPosition, combinedVertQuadrics);

					// v^T * (Q * v):
					var candidateError = vec4.dot(candidateCollapsedPosition, result);

					if (candidateError < selectedEdgeError)
					{
						selectedEdge 			= candidateEdge;
						selectedEdgeError 		= candidateError;
						collapsedVertexPosition = candidateCollapsedPosition;
					}
				}
				
			}	// End of random selection loop


			// Remove the selected edge:
			if (selectedEdge != null && selectedEdgeError != Infinity)
			{
				if (DEBUG_ENABLED)
				{
					DEBUG_EDGE_SEQUENCE += "[" + selectedEdge._vertOrigin._vertIndex + ", " + selectedEdge._vertDest._vertIndex + "],\n";

					console.log("************ Collapsing selected edge: ************\n" + selectedEdge._vertOrigin._vertIndex + ", " + selectedEdge._vertDest._vertIndex);
				}
				

				// Pre-collapse any neighboring faces that will be invalidated by the current edge collapse:
				var leftSplittingEdge 	= this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCW;
				var rightSplittingEdge 	= this.getInverseEdge(this.getInverseEdge(selectedEdge)._edgeLeftCCW)._edgeLeftCW;

				// Pre-collapse faces/edges to the left:
				if(
					leftSplittingEdge._edgeLeftCW._vertOrigin._vertIndex == selectedEdge._vertDest._vertIndex &&
					this.getInverseEdge(leftSplittingEdge)._edgeLeftCCW._vertDest._vertIndex == selectedEdge._vertOrigin._vertIndex
					)
				{
					if (DEBUG_ENABLED)
					{
						console.log("Found left splitting edge!!!");
					}					

					// Pre-update the error quadric at the surviving vertex:
					mat4.add(leftSplittingEdge._vertOrigin._errorQuadric, leftSplittingEdge._vertOrigin._errorQuadric, leftSplittingEdge._vertDest._errorQuadric);

					this.decimateDegree3Edge(leftSplittingEdge);
					currentEdgeCount -= 3;

					if (currentEdgeCount <= 6)
					{
						console.log("ERROR: There are only " + currentEdgeCount + " edges in the mesh. Aborting decimation");
						break;
					}
				}

				// Pre-collapse faces/edges to the right:
				if (rightSplittingEdge._edgeLeftCCW._vertDest._vertIndex == selectedEdge._vertOrigin._vertIndex &&
					this.getInverseEdge(rightSplittingEdge)._edgeLeftCW._vertOrigin._vertIndex == selectedEdge._vertDest._vertIndex
					)
				{
					if (DEBUG_ENABLED)
					{
						console.log("Found right splitting edge!!!");
					}
					
					// Pre-update the error quadric at the surviving vertex:
					mat4.add(rightSplittingEdge._vertOrigin._errorQuadric, rightSplittingEdge._vertOrigin._errorQuadric, rightSplittingEdge._vertDest._errorQuadric);

					this.decimateDegree3Edge(rightSplittingEdge);
					currentEdgeCount -= 3;

					if (currentEdgeCount <= 6)
					{
						console.log("ERROR: There are only " + currentEdgeCount + " edges in the mesh. Aborting decimation");
						break;
					}
				}


				// Detect edges that cross over, and would cause an invalid fins/non-manifold geometry. At most, the selectedEdge origin/dest vertices should be shared by 2 faces
				var numSharedFaces = 0;
				for (var currentVert = 0; currentVert < this._edges[0].length; currentVert++)
				{
					if (this._edges[selectedEdge._vertOrigin._vertIndex][currentVert] != null && this._edges[selectedEdge._vertDest._vertIndex][currentVert] != null)
					{
						numSharedFaces++;

						if (numSharedFaces > 2)
						{
							break;
						}
					}
				}
				if (DEBUG_ENABLED)
				{
					console.log("Found " + numSharedFaces + " shared faces");
				}

				if (numSharedFaces > 2)
				{
					continue;
				}


				// Find the degree of the deprecated vertex:
				var destVertDegree = this.countVertexDegree( selectedEdge._vertDest._vertIndex);
				

				// Update the origin vertex position to match the computed ideal vertex position:
				selectedEdge._vertOrigin._position 	= vec3.fromValues(collapsedVertexPosition[0], collapsedVertexPosition[1], collapsedVertexPosition[2]);		

				if (DEBUG_ENABLED)
				{
					console.log("Decimating edge: " + selectedEdge._vertOrigin._vertIndex + " -> " + selectedEdge._vertDest._vertIndex);
					console.log("Destination (vert idx = " +  selectedEdge._vertDest._vertIndex + ") degree = " + destVertDegree);
					console.log("collapsed position = " + collapsedVertexPosition[0] + ", " + collapsedVertexPosition[1] + " " + collapsedVertexPosition[2]);
					console.log("Edge origin pos = " + selectedEdge._vertOrigin._position[0] + ", " + selectedEdge._vertOrigin._position[1] + " " + selectedEdge._vertOrigin._position[2]);
					console.log("Edge dest pos = " + selectedEdge._vertDest._position[0] + ", " + selectedEdge._vertDest._position[1] + " " + selectedEdge._vertDest._position[2]);
				}				
				

				// Handle the various degree configurations:
				if (destVertDegree < 3 && DEBUG_ENABLED)
				{
					console.log("[mesh][decimateMesh] Error: Found a vertex with degree < 3");
				}
				else if (destVertDegree == 3)
				{
					this.decimateDegree3Edge(selectedEdge);
					currentEdgeCount -= 3;
				}
				else if (destVertDegree == 4)
				{
					if (DEBUG_ENABLED)
					{
						console.log("DECIMATING EDGE WITH DEGREE 4 VERT");
					}

					// Get outer CCW edges:
					var topLeftEdge 	= this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCW;
					var botLeftEdge		= selectedEdge._edgeLeftCW;
					var topRightEdge 	= this.getInverseEdge(this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCCW)._edgeLeftCW;
					var botRightEdge 	= this.getInverseEdge(selectedEdge)._edgeLeftCCW;

					// Get inner deprecated CCW edges:
					var deprecatedLeftEdge 	= selectedEdge._edgeLeftCCW;
					var deprecatedRightEdge = this.getInverseEdge(selectedEdge)._edgeLeftCW;

					// Get the surviving inner edge:
					var innerEdge 		= this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCCW; // Points up in same direction as selected edge
					var invInnerEdge 	= this.getInverseEdge(innerEdge);

					// if (DEBUG_ENABLED)
					// {
					// 	this.printEdgeLoop(selectedEdge, "selectedEdge");
					// 	this.printEdgeLoop(topLeftEdge, "topLeftEdge");
					// 	this.printEdgeLoop(botLeftEdge, "botLeftEdge");
					// 	this.printEdgeLoop(topRightEdge, "topRightEdge");
					// 	this.printEdgeLoop(botRightEdge, "botRightEdge");
					// 	this.printEdgeLoop(deprecatedLeftEdge, "deprecatedLeftEdge");
					// 	this.printEdgeLoop(deprecatedRightEdge, "deprecatedRightEdge");
					// 	this.printEdgeLoop(innerEdge, "innerEdge");
					// 	this.printEdgeLoop(invInnerEdge, "invInnerEdge");

					// 	console.log("selectedEdge faceleft = " + selectedEdge._faceLeft._faceIndex + ", faceright = " + selectedEdge._faceRight._faceIndex);
					// 	console.log("topLeftEdge faceleft = " + topLeftEdge._faceLeft._faceIndex + ", faceright = " + topLeftEdge._faceRight._faceIndex);
					// 	console.log("botLeftEdge faceleft = " + botLeftEdge._faceLeft._faceIndex + ", faceright = " + botLeftEdge._faceRight._faceIndex);
					// 	console.log("topRightEdge faceleft = " + topRightEdge._faceLeft._faceIndex + ", faceright = " + topRightEdge._faceRight._faceIndex);
					// 	console.log("botRightEdge faceleft = " + botRightEdge._faceLeft._faceIndex + ", faceright = " + botRightEdge._faceRight._faceIndex);
					// 	console.log("deprecatedLeftEdge faceleft = " + deprecatedLeftEdge._faceLeft._faceIndex + ", faceright = " + deprecatedLeftEdge._faceRight._faceIndex);
					// 	console.log("deprecatedRightEdge faceleft = " + deprecatedRightEdge._faceLeft._faceIndex + ", faceright = " + deprecatedRightEdge._faceRight._faceIndex);
					// 	console.log("innerEdge faceleft = " + innerEdge._faceLeft._faceIndex + ", faceright = " + innerEdge._faceRight._faceIndex);
					// 	console.log("invInnerEdge faceleft = " + invInnerEdge._faceLeft._faceIndex + ", faceright = " + invInnerEdge._faceRight._faceIndex);
					// }
					
					// Update edge pointers:
					topLeftEdge._edgeLeftCCW 	= botLeftEdge;
					botLeftEdge._edgeLeftCCW 	= innerEdge;
					innerEdge._edgeLeftCCW 		= topLeftEdge;

					topLeftEdge._edgeLeftCW		= innerEdge;
					innerEdge._edgeLeftCW		= botLeftEdge;
					botLeftEdge._edgeLeftCW		= topLeftEdge;

					invInnerEdge._edgeLeftCCW 	= botRightEdge;
					botRightEdge._edgeLeftCCW 	= topRightEdge;
					topRightEdge._edgeLeftCCW 	= invInnerEdge;

					invInnerEdge._edgeLeftCW 	= topRightEdge;
					topRightEdge._edgeLeftCW	= botRightEdge;
					botRightEdge._edgeLeftCW	= invInnerEdge;

					// Remove the surviving edge from its current location in the edge table:
					this._edges[innerEdge._vertOrigin._vertIndex][innerEdge._vertDest._vertIndex] 		= null;
					this._edges[invInnerEdge._vertOrigin._vertIndex][invInnerEdge._vertDest._vertIndex] = null;

					// Update the surviving edge vertices:
					innerEdge._vertOrigin 	= selectedEdge._vertOrigin;
					invInnerEdge._vertDest 	= selectedEdge._vertOrigin;

					// Update the vert -> edge pointer:
					innerEdge._vertOrigin._edge = innerEdge;

					this._edges[innerEdge._vertOrigin._vertIndex][innerEdge._vertDest._vertIndex]		= innerEdge;
					this._edges[invInnerEdge._vertOrigin._vertIndex][invInnerEdge._vertDest._vertIndex] = invInnerEdge;

					// Delete the deprecated inner faces:
					this._faces[innerEdge._faceLeft._faceIndex] 	= null;
					this._faces[innerEdge._faceRight._faceIndex] 	= null;

					// Update face pointers. Keep the selected edge's left/right faces:
					topLeftEdge._faceLeft 	= selectedEdge._faceLeft;
					botLeftEdge._faceLeft 	= selectedEdge._faceLeft;
					innerEdge._faceLeft 	= selectedEdge._faceLeft;

					this.getInverseEdge(topLeftEdge)._faceRight = selectedEdge._faceLeft;
					this.getInverseEdge(botLeftEdge)._faceRight = selectedEdge._faceLeft;
					invInnerEdge._faceRight = selectedEdge._faceLeft;

					topRightEdge._faceLeft = selectedEdge._faceRight;
					invInnerEdge._faceLeft = selectedEdge._faceRight;
					botRightEdge._faceLeft = selectedEdge._faceRight;

					this.getInverseEdge(topRightEdge)._faceRight 	= selectedEdge._faceRight;
					this.getInverseEdge(botRightEdge)._faceRight 	= selectedEdge._faceRight;
					innerEdge._faceRight							= selectedEdge._faceRight;

					// Update face -> edge pointers:
					selectedEdge._faceLeft._edge 	= innerEdge;
					selectedEdge._faceRight._edge 	= invInnerEdge;

					// Delete the deprecated edges:
					this._edges[deprecatedLeftEdge._vertOrigin._vertIndex][deprecatedLeftEdge._vertDest._vertIndex] = null;
					this._edges[deprecatedLeftEdge._vertDest._vertIndex][deprecatedLeftEdge._vertOrigin._vertIndex] = null;

					this._edges[deprecatedRightEdge._vertOrigin._vertIndex][deprecatedRightEdge._vertDest._vertIndex] = null;
					this._edges[deprecatedRightEdge._vertDest._vertIndex][deprecatedRightEdge._vertOrigin._vertIndex] = null;

					currentEdgeCount -= 2;	// Decrement by the number of 1-way edges removed
				}
				else if(destVertDegree == 5)
				{
					if (DEBUG_ENABLED)
					{
						console.log("DECIMATING EDGE WITH DEGREE 5 VERT");
					}

					// Get outer CCW edges:
					var topLeftEdge 	= this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCW;
					var botLeftEdge 	= selectedEdge._edgeLeftCW;
					var botRightEdge 	= this.getInverseEdge(selectedEdge)._edgeLeftCCW;
					var topRightEdge 	= this.getInverseEdge(this.getInverseEdge(selectedEdge)._edgeLeftCW)._edgeLeftCCW;
					var topCenterEdge	= this.getInverseEdge(this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCCW)._edgeLeftCW;
					
					// Get inner deprecated CCW edges:
					var botLeftDeprecatedEdge 	= selectedEdge._edgeLeftCCW;
					var botRightDeprecatedEdge 	= this.getInverseEdge(selectedEdge)._edgeLeftCW;

					// Get the surviving inner edges:
					var leftInnerEdge 		= this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCCW;
					var invLeftInnerEdge 	= this.getInverseEdge(leftInnerEdge);
					var rightInnerEdge 		= this.getInverseEdge(this.getInverseEdge(selectedEdge)._edgeLeftCW)._edgeLeftCW;
					var invRightInnerEdge 	= this.getInverseEdge(rightInnerEdge);

					// if (DEBUG_ENABLED)
					// {
					// 	this.printEdgeLoop(selectedEdge, "selectedEdge");
					// 	this.printEdgeLoop(topLeftEdge, "topLeftEdge");
					// 	this.printEdgeLoop(botLeftEdge, "botLeftEdge");
					// 	this.printEdgeLoop(botRightEdge, "botRightEdge");
					// 	this.printEdgeLoop(topRightEdge, "topRightEdge");
					// 	this.printEdgeLoop(topCenterEdge, "topCenterEdge");
					// 	this.printEdgeLoop(botLeftDeprecatedEdge, "botLeftDeprecatedEdge");
					// 	this.printEdgeLoop(botRightDeprecatedEdge, "botRightDeprecatedEdge");
					// 	this.printEdgeLoop(leftInnerEdge, "leftInnerEdge");
					// 	this.printEdgeLoop(invLeftInnerEdge, "invLeftInnerEdge");
					// 	this.printEdgeLoop(rightInnerEdge, "rightInnerEdge");
					// 	this.printEdgeLoop(invRightInnerEdge, "invRightInnerEdge");
					// }

					// Update edge pointers:
					topLeftEdge._edgeLeftCCW 		= botLeftEdge;		// Left triangle CCW
					botLeftEdge._edgeLeftCCW 		= leftInnerEdge;
					leftInnerEdge._edgeLeftCCW 		= topLeftEdge;

					topLeftEdge._edgeLeftCW			= leftInnerEdge;	// Left triangle CW
					leftInnerEdge._edgeLeftCW		= botLeftEdge;
					botLeftEdge._edgeLeftCW			= topLeftEdge;

					topCenterEdge._edgeLeftCCW 		= invLeftInnerEdge;		// Center triangle CCW
					invLeftInnerEdge._edgeLeftCCW	= invRightInnerEdge;
					invRightInnerEdge._edgeLeftCCW	= topCenterEdge;

					topCenterEdge._edgeLeftCW		= invRightInnerEdge;	// Center triangle CW
					invRightInnerEdge._edgeLeftCW	= invLeftInnerEdge;
					invLeftInnerEdge._edgeLeftCW	= topCenterEdge;

					topRightEdge._edgeLeftCCW		= rightInnerEdge;	// Right triangle CCW
					rightInnerEdge._edgeLeftCCW		= botRightEdge;
					botRightEdge._edgeLeftCCW		= topRightEdge;

					topRightEdge._edgeLeftCW		= botRightEdge;		// Right triangle CW
					botRightEdge._edgeLeftCW		= rightInnerEdge;
					rightInnerEdge._edgeLeftCW		= topRightEdge;

					// Update the edge table:
					this._edges[leftInnerEdge._vertOrigin._vertIndex][leftInnerEdge._vertDest._vertIndex] 		= null;
					this._edges[invLeftInnerEdge._vertOrigin._vertIndex][invLeftInnerEdge._vertDest._vertIndex] = null;

					this._edges[rightInnerEdge._vertOrigin._vertIndex][rightInnerEdge._vertDest._vertIndex] 		= null;
					this._edges[invRightInnerEdge._vertOrigin._vertIndex][invRightInnerEdge._vertDest._vertIndex] 	= null;

					// Replace the verts:
					leftInnerEdge._vertOrigin 		= selectedEdge._vertOrigin;
					invLeftInnerEdge._vertDest 		= selectedEdge._vertOrigin;

					rightInnerEdge._vertDest 		= selectedEdge._vertOrigin;
					invRightInnerEdge._vertOrigin 	= selectedEdge._vertOrigin;

					// Update the vert -> edge pointer:
					leftInnerEdge._vertOrigin._edge = leftInnerEdge;

					// Reinsert into the edge table:
					this._edges[leftInnerEdge._vertOrigin._vertIndex][leftInnerEdge._vertDest._vertIndex] 			= leftInnerEdge;
					this._edges[invLeftInnerEdge._vertOrigin._vertIndex][invLeftInnerEdge._vertDest._vertIndex] 	= invLeftInnerEdge;

					this._edges[rightInnerEdge._vertOrigin._vertIndex][rightInnerEdge._vertDest._vertIndex] 		= rightInnerEdge;
					this._edges[invRightInnerEdge._vertOrigin._vertIndex][invRightInnerEdge._vertDest._vertIndex] 	= invRightInnerEdge;


					// if (DEBUG_ENABLED)
					// {
					// 	console.log("UPDATED EDGE LOOPS:");
					// 	this.printEdgeLoop(topLeftEdge, "topLeftEdge");
					// 	this.printEdgeLoop(botLeftEdge, "botLeftEdge");
					// 	this.printEdgeLoop(botRightEdge, "botRightEdge");
					// 	this.printEdgeLoop(topRightEdge, "topRightEdge");
					// 	this.printEdgeLoop(topCenterEdge, "topCenterEdge");
					// 	this.printEdgeLoop(leftInnerEdge, "leftInnerEdge");
					// 	this.printEdgeLoop(invLeftInnerEdge, "invLeftInnerEdge");
					// 	this.printEdgeLoop(rightInnerEdge, "rightInnerEdge");
					// 	this.printEdgeLoop(invRightInnerEdge, "invRightInnerEdge");
					// }		


					// Delete the deprecated inner faces:
					this._faces[botLeftDeprecatedEdge._faceRight._faceIndex] 	= null;
					this._faces[botRightDeprecatedEdge._faceRight._faceIndex] 	= null;

					// Update face pointers. Keep the selected edge's left/right faces:
					topLeftEdge._faceLeft 							= selectedEdge._faceLeft;
					this.getInverseEdge(topLeftEdge)._faceRight 	= selectedEdge._faceLeft;

					botLeftEdge._faceLeft 							= selectedEdge._faceLeft;
					this.getInverseEdge(botLeftEdge)._faceRight 	= selectedEdge._faceLeft;

					botRightEdge._faceLeft 							= selectedEdge._faceRight;
					this.getInverseEdge(botRightEdge)._faceRight 	= selectedEdge._faceRight;

					topRightEdge._faceLeft 							= selectedEdge._faceRight;
					this.getInverseEdge(topRightEdge)._faceRight 	= selectedEdge._faceRight;

					// topCenterEdge	// Does not change...
					
					leftInnerEdge._faceLeft 		= selectedEdge._faceLeft;
					leftInnerEdge._faceRight 		= topCenterEdge._faceLeft;

					invLeftInnerEdge._faceLeft 		= topCenterEdge._faceLeft;
					invLeftInnerEdge._faceRight 	= selectedEdge._faceLeft;

					rightInnerEdge._faceLeft 		= selectedEdge._faceRight;
					rightInnerEdge._faceRight 		= topCenterEdge._faceLeft;

					invRightInnerEdge._faceLeft 	= topCenterEdge._faceLeft;
					invRightInnerEdge._faceRight 	= selectedEdge._faceRight;

					// Update face -> edge pointers:
					selectedEdge._faceLeft._edge 	= botLeftEdge;
					selectedEdge._faceRight._edge 	= botRightEdge;
					// Don't need to update topCenterEdge

					// Delete the deprecated edges:
					this._edges[botLeftDeprecatedEdge._vertOrigin._vertIndex][botLeftDeprecatedEdge._vertDest._vertIndex] 	= null;
					this._edges[botLeftDeprecatedEdge._vertDest._vertIndex][botLeftDeprecatedEdge._vertOrigin._vertIndex] 	= null;
					
					this._edges[botRightDeprecatedEdge._vertOrigin._vertIndex][botRightDeprecatedEdge._vertDest._vertIndex] = null;
					this._edges[botRightDeprecatedEdge._vertDest._vertIndex][botRightDeprecatedEdge._vertOrigin._vertIndex] = null;

					currentEdgeCount -= 2;	// Decrement by the number of 1-way edges removed
				}
				else if (destVertDegree >= 6)
				{
					if (DEBUG_ENABLED)
					{
						console.log("DECIMATING EDGE WITH DEGREE >=6 VERT");
					}

					var leftDeprecatedEdge 		= selectedEdge._edgeLeftCCW;
					var rightDeprecatedEdge 	= this.getInverseEdge(selectedEdge)._edgeLeftCW;

					var leftEdge 				= this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCCW;
					var leftEdgeCCW 			= leftEdge._edgeLeftCCW;

					var rightEdge 				= this.getInverseEdge(this.getInverseEdge(selectedEdge)._edgeLeftCW)._edgeLeftCW;
					var rightEdgeCW 			= rightEdge._edgeLeftCW;

					var botLeftEdge 			= selectedEdge._edgeLeftCW;
					var botRightEdge			= this.getInverseEdge(selectedEdge)._edgeLeftCCW;

					// if (DEBUG_ENABLED)
					// {
					// 	this.printEdgeLoop(leftDeprecatedEdge, "leftDeprecatedEdge");
					// 	this.printEdgeLoop(rightDeprecatedEdge, "rightDeprecatedEdge");
					// 	this.printEdgeLoop(leftEdge, "leftEdge");
					// 	this.printEdgeLoop(rightEdge, "rightEdge");
					// 	this.printEdgeLoop(botLeftEdge, "botLeftEdge");
					// 	this.printEdgeLoop(botRightEdge, "botRightEdge");
					// }

					// Update the edge verts:
					var vertNeighbors = this.getVertexNeighbors(selectedEdge._vertDest._vertIndex);
					for (var currentVert = 0; currentVert < vertNeighbors.length; currentVert++)
					{
						if (	this._edges[selectedEdge._vertDest._vertIndex][vertNeighbors[currentVert]._vertIndex] != leftDeprecatedEdge &&
								this._edges[vertNeighbors[currentVert]._vertIndex][selectedEdge._vertDest._vertIndex] != rightDeprecatedEdge &&
								vertNeighbors[currentVert]._vertIndex != selectedEdge._vertOrigin._vertIndex
						)
						{
							// Retrieve the edge references:
							var currentEdge 	= this._edges[selectedEdge._vertDest._vertIndex][vertNeighbors[currentVert]._vertIndex];
							var invCurrentEdge 	= this.getInverseEdge(currentEdge);

							// Remove the existing edges from the table:
							this._edges[currentEdge._vertOrigin._vertIndex][currentEdge._vertDest._vertIndex] 		= null;
							this._edges[invCurrentEdge._vertOrigin._vertIndex][invCurrentEdge._vertDest._vertIndex] = null;

							// Update the vertices:
							currentEdge._vertOrigin 	= selectedEdge._vertOrigin;
							invCurrentEdge._vertDest 	= selectedEdge._vertOrigin;


							// Check: Is there already an edge where we're about to assemble one?
							if (this._edges[selectedEdge._vertOrigin._vertIndex][currentEdge._vertDest._vertIndex] != null ||		// SelectedEdge's origin -> neighbor vert
								this._edges[invCurrentEdge._vertOrigin._vertIndex][selectedEdge._vertOrigin._vertIndex] != null		// Neighbor vert -> selectedEdge's origin
								)
							{
								// NOTE: This is a safety check for a bug that no longer occurs. Leaving it here as a precaution only.
								console.log("ERROR: Found an existing edge in the table: " + selectedEdge._vertOrigin._vertIndex + ", " + currentEdge._vertDest._vertIndex);

								// Hail mary: Attempt to reconnect the edge flow:
								var existingForwardEdge = this._edges[selectedEdge._vertOrigin._vertIndex][currentEdge._vertDest._vertIndex];
								var existingInverseEdge = this._edges[invCurrentEdge._vertOrigin._vertIndex][selectedEdge._vertOrigin._vertIndex];

								currentEdge._edgeLeftCW._edgeLeftCCW = existingForwardEdge;
								currentEdge._edgeLeftCCW._edgeLeftCW = existingForwardEdge;

								invCurrentEdge._edgeLeftCW._edgeLeftCCW = existingInverseEdge;
								invCurrentEdge._edgeLeftCCW._edgeLeftCW = existingInverseEdge;
																
								continue;
							}

							// Insert the updated edges back into the table:
							this._edges[currentEdge._vertOrigin._vertIndex][currentEdge._vertDest._vertIndex] 		= currentEdge;
							this._edges[invCurrentEdge._vertOrigin._vertIndex][invCurrentEdge._vertDest._vertIndex] = invCurrentEdge;

							// Update face normals:
							currentEdge._faceLeft.computeFaceNormal(false);
							currentEdge._faceRight.computeFaceNormal(false);
						}
					}

					// Update the vert -> edge pointer:
					leftEdge._vertOrigin._edge = leftEdge;

					// Update the edge pointers:
					leftEdge._edgeLeftCCW 		= leftEdgeCCW; 	// Not necessary, but for readability...
					leftEdgeCCW._edgeLeftCCW	= botLeftEdge;
					botLeftEdge._edgeLeftCCW	= leftEdge;

					leftEdge._edgeLeftCW		= botLeftEdge;
					botLeftEdge._edgeLeftCW		= leftEdgeCCW;
					leftEdgeCCW._edgeLeftCW		= leftEdge;

					rightEdge._edgeLeftCCW 		= botRightEdge;
					botRightEdge._edgeLeftCCW	= rightEdgeCW;
					rightEdgeCW._edgeLeftCCW	= rightEdge;

					rightEdge._edgeLeftCW		= rightEdgeCW;
					rightEdgeCW._edgeLeftCW		= botRightEdge;
					botRightEdge._edgeLeftCW	= rightEdge;

					// Delete the deprecated faces:
					this._faces[leftDeprecatedEdge._faceRight._faceIndex] = null;
					this._faces[rightDeprecatedEdge._faceRight._faceIndex] = null;

					// Update the face pointers: Keep selectedEdge's left/right faces:
					leftEdge._faceLeft 			= selectedEdge._faceLeft;
					leftEdgeCCW._faceLeft		= selectedEdge._faceLeft;
					botLeftEdge._faceLeft		= selectedEdge._faceLeft;

					this.getInverseEdge(leftEdge)._faceRight 	= selectedEdge._faceLeft;
					this.getInverseEdge(leftEdgeCCW)._faceRight = selectedEdge._faceLeft;
					this.getInverseEdge(botLeftEdge)._faceRight = selectedEdge._faceLeft;

					rightEdge._faceLeft 	= selectedEdge._faceRight;
					rightEdgeCW._faceLeft 	= selectedEdge._faceRight;
					botRightEdge._faceLeft	= selectedEdge._faceRight;

					this.getInverseEdge(rightEdge)._faceRight 		= selectedEdge._faceRight;
					this.getInverseEdge(rightEdgeCW)._faceRight 	= selectedEdge._faceRight;
					this.getInverseEdge(botRightEdge)._faceRight 	= selectedEdge._faceRight;

					// Update the face -> edge pointers:
					selectedEdge._faceLeft._edge	= botLeftEdge;
					selectedEdge._faceRight._edge 	= botRightEdge;

					// Delete the deprecated edges:
					this._edges[leftDeprecatedEdge._vertOrigin._vertIndex][leftDeprecatedEdge._vertDest._vertIndex] = null;
					this._edges[leftDeprecatedEdge._vertDest._vertIndex][leftDeprecatedEdge._vertOrigin._vertIndex] = null;

					this._edges[rightDeprecatedEdge._vertOrigin._vertIndex][rightDeprecatedEdge._vertDest._vertIndex] = null;
					this._edges[rightDeprecatedEdge._vertDest._vertIndex][rightDeprecatedEdge._vertOrigin._vertIndex] = null;

					currentEdgeCount -= 2;	// Decrement by the number of 1-way edges removed
				}

				// Update the error quadric at the surviving vertex:
				mat4.add(selectedEdge._vertOrigin._errorQuadric, selectedEdge._vertOrigin._errorQuadric, selectedEdge._vertDest._errorQuadric);

				// Cleanup:
				if (destVertDegree != 3)	// If the dest degree is 3, we've already done this
				{
					// Update the remaining face normals:
					selectedEdge._faceLeft.computeFaceNormal(false);
					selectedEdge._faceRight.computeFaceNormal(false);

					// Delete the selected edge:
					this._edges[selectedEdge._vertOrigin._vertIndex][selectedEdge._vertDest._vertIndex] = null;
					this._edges[selectedEdge._vertDest._vertIndex][selectedEdge._vertOrigin._vertIndex] = null;		
					currentEdgeCount -= 1;	// Decrement by the number of 1-way edges removed

					// Finally, delete the inner vertex:
					this._vertices[selectedEdge._vertDest._vertIndex] = null;

					if (DEBUG_ENABLED)
					{
						console.log("Deleted selected edge: " + selectedEdge._vertOrigin._vertIndex + " -> " + selectedEdge._vertDest._vertIndex);
						console.log("Deleted inverse selected edge: " + selectedEdge._vertDest._vertIndex + " -> " + selectedEdge._vertOrigin._vertIndex);
						console.log("Deleted vertex " + selectedEdge._vertDest._vertIndex);

						console.log("Deleted vertex Pos " + selectedEdge._vertDest._position[0] + ", " +selectedEdge._vertDest._position[1] + ", " +selectedEdge._vertDest._position[2]);
					}
				}
		
				if (DEBUG_ENABLED)
				{
					console.log("Edge removal complete");
					this.validateMesh();
				}				
			}
			else
			{
				console.log("[mesh][decimateMesh] Error: Did not select a valid candidate edge");
			}


		} // End of edge loop

		this.removeEmptyPrimitives();

		console.log("[mesh][decimateMesh] Decimation complete! New mesh has " + this.getNum1WayEdges() + " edges, " + this._faces.length + " faces, and vert array size = " + this._vertices.length);

		// Compute the smooth normals:
		this.computeSmoothNormals();

		// Finally, re-initialize the buffers:
		this.initializeBuffers();
	}


	// Helper function: Collapse an edge terminating in a degree 3 vertex
	// Note: The selectedEdge destination vertex MUST be degree 3 
	decimateDegree3Edge(selectedEdge)
	{
		if (DEBUG_ENABLED)
		{
			console.log("DECIMATING EDGE WITH DEGREE 3 VERT");
			console.log("Selected edge:")
			this.printEdgeLoop(selectedEdge);

			this.validateMesh();			
		}
		
		var selectedOriginIdx 	= selectedEdge._vertOrigin._vertIndex;
		var selectedDestIdx 	= selectedEdge._vertDest._vertIndex;

		// Get outer CCW edges:
		var leftEdge 	= selectedEdge._edgeLeftCW;
		var rightEdge 	= this.getInverseEdge(selectedEdge)._edgeLeftCCW;
		var backEdge 	= this.getInverseEdge(selectedEdge._edgeLeftCCW)._edgeLeftCW;

		// Get inner deprecated CCW edges:
		var deprecatedLeftEdge 	= selectedEdge._edgeLeftCCW;
		var deprecatedRightEdge = this.getInverseEdge(selectedEdge)._edgeLeftCW;

		// Delete the deprecated inner faces:
		this._faces[deprecatedLeftEdge._faceRight._faceIndex] = null;	// Top face
		this._faces[deprecatedRightEdge._faceLeft._faceIndex] = null;	// Right face

		// Update pointers around the updated face:
		leftEdge._edgeLeftCCW 	= rightEdge;
		rightEdge._edgeLeftCCW 	= backEdge;
		backEdge._edgeLeftCCW 	= leftEdge;

		leftEdge._edgeLeftCW 	= backEdge;
		backEdge._edgeLeftCW 	= rightEdge;
		rightEdge._edgeLeftCW 	= leftEdge;

		// Update face -> edge pointer:
		selectedEdge._faceLeft._edge = leftEdge;

		// Update face pointers. Keep the selected edge's left face:
		leftEdge._faceLeft 	= selectedEdge._faceLeft;
		rightEdge._faceLeft = selectedEdge._faceLeft;
		backEdge._faceLeft 	= selectedEdge._faceLeft;

		this.getInverseEdge(leftEdge)._faceRight 	= selectedEdge._faceLeft;
		this.getInverseEdge(rightEdge)._faceRight 	= selectedEdge._faceLeft;
		this.getInverseEdge(backEdge)._faceRight 	= selectedEdge._faceLeft;

		// Delete the selected edge:
		this._edges[selectedOriginIdx][selectedDestIdx] = null;
		this._edges[selectedDestIdx][selectedOriginIdx] = null;
		
		// Delete the deprecated edges:
		this._edges[deprecatedLeftEdge._vertOrigin._vertIndex][deprecatedLeftEdge._vertDest._vertIndex] = null;
		this._edges[deprecatedLeftEdge._vertDest._vertIndex][deprecatedLeftEdge._vertOrigin._vertIndex] = null;
		
		this._edges[deprecatedRightEdge._vertOrigin._vertIndex][deprecatedRightEdge._vertDest._vertIndex] = null;
		this._edges[deprecatedRightEdge._vertDest._vertIndex][deprecatedRightEdge._vertOrigin._vertIndex] = null;
		
		// Finally, delete the inner vertex:
		this._vertices[selectedDestIdx] = null;
		
		if (DEBUG_ENABLED)
		{
			console.log("Deleted " + selectedOriginIdx + " <-> " + selectedDestIdx);
			console.log("Deleted " + deprecatedLeftEdge._vertOrigin._vertIndex + " <-> " + deprecatedLeftEdge._vertDest._vertIndex);
			console.log("Deleted " + deprecatedRightEdge._vertOrigin._vertIndex + " <-> " + deprecatedRightEdge._vertDest._vertIndex);
			console.log("Deleted vertex " + selectedDestIdx);
		}

		// Recompute the face normal
		selectedEdge._faceLeft.computeFaceNormal(false);
	}


	// Helper function: Deletes deprecated (null) verts/faces, and updates their indices:
	removeEmptyPrimitives()
	{
		if (DEBUG_ENABLED)
		{
			console.log("REMOVING EMPTY PRIMITIVES:");
		}		

		// Cleanup faces:
		var newFaces = [];
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			if (this._faces[currentFace] != null)
			{
				// Recompute the face normal:
				this._faces[currentFace].computeFaceNormal(false);

				this._faces[currentFace]._faceIndex = newFaces.length;
				newFaces.push(this._faces[currentFace]);
			}
		}
		this._faces = newFaces;

		// Repack the vertices array, and update the indexes:
		var newVerts = [];		
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{
			if (this._vertices[currentVert] != null)
			{
				this._vertices[currentVert]._vertIndex = newVerts.length;
				newVerts.push(this._vertices[currentVert]);

				if (DEBUG_ENABLED)
				{
					// console.log("Remapped vertex [" + currentVert + "] -> [" + this._vertices[currentVert]._vertIndex + "]");
				}
			}					
		}
		this._vertices 	= newVerts;
		
		// Allocate a new edge table:
		var newEdges = [];
		for (var currentRow = 0; currentRow < this._vertices.length; currentRow++)
		{
			newEdges.push(new Array());
			for (var currentCol = 0; currentCol < this._vertices.length; currentCol++)
			{
				newEdges[currentRow].push(null);
			}
		}

		// Repack the edge table according to the updated vertex indexes:
		for (var row = 0; row < this._edges[0].length; row++)
		{
			for (var col = 0; col < this._edges[0].length; col++)
			{
				if (this._edges[row][col] != null)
				{
					if (DEBUG_ENABLED)
					{
						if (newEdges[ this._edges[row][col]._vertOrigin._vertIndex ][ this._edges[row][col]._vertDest._vertIndex ] != null)
						{
							console.log("ERROR: newEdges already has an edge at [" + this._edges[row][col]._vertOrigin._vertIndex + "][" + this._edges[row][col]._vertDest._vertIndex + "]");
						}

						// console.log("Remapped edge (" + row + ", " + col + ") -> (" + this._edges[row][col]._vertOrigin._vertIndex + ", " + this._edges[row][col]._vertDest._vertIndex + ")");
					}				

					newEdges[ this._edges[row][col]._vertOrigin._vertIndex ][ this._edges[row][col]._vertDest._vertIndex ] = this._edges[row][col];
				}
			}
		}
		this._edges 	= newEdges;

		this._numEdgesIsDirty 		= true;
		this._vertexDegreesAreDirty 	= true;

		if (DEBUG_ENABLED)
		{
			console.log("PRIMITIVE CLEANUP COMPLETE!");
			this.validateMesh();
		}		
	}


	// Helper function: Calls the appropriate subdivision function
	subdivideMesh(subdivisionType, numberOfLevels)
	{
		if(!this.isInitialized())
		{
			alert("[mesh][subdivideMesh] Error: You must load a mesh before subdivision can be performed");
			return;
		}

		if (subdivisionType < SUBDIVISION_TYPE.LOOP || subdivisionType > SUBDIVISION_TYPE.BUTTERFLY)
		{
			console.log("[mesh][subdivideMesh] Invalid subdivision type received! Aborting");
			return;
		}

		// Perform the required number of iterations:
		for (var currentIteration = 0; currentIteration < numberOfLevels; currentIteration++)
		{
			this.doSubdivideMesh(subdivisionType);
		}

		console.log("[mesh][subdivideMesh] Subdivision complete: Mesh now has " + this._vertices.length + " verts, " + this.getNum1WayEdges() + " edges, and " + this._faces.length + " faces");
	}


	// Subdivide this mesh:
	doSubdivideMesh(subdivisionMode)
	{
		var totalEdges = this.getNum1WayEdges();

		this._vertexDegreesAreDirty 	= true;		// Mark the vertex degree count as dirty to ensure we recalculate the degrees
		this._numEdgesIsDirty 			= true;		// Mark the edges table as dirty

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
			if (subdivisionMode == SUBDIVISION_TYPE.LOOP)
			{
				var currentDegree = this.getVertexDegree(currentVert);

				if (currentDegree < 3)
				{
					console.log("[mesh][subdivideMesh] ERROR: Vertex #" + currentVert + "/" + this._vertices.length + " has invalid degree " + currentDegree);
					console.log(this._vertices[currentVert]);
					return;
				}
	
				var beta 			= (1.0 / currentDegree) * (FIVE_OVER_EIGHT - Math.pow(THREE_OVER_EIGHT + ONE_OVER_FOUR * Math.cos(TWO_PI / currentDegree), 2));
				var oneMinusNBeta 	=  1.0 - (currentDegree * beta);
	
				// Get neighbors of the current vert:
				var neighborVerts = this.getVertexNeighbors(currentVert);
	
				// Apply the vertex rule at each neighbors:
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
			else if (subdivisionMode == SUBDIVISION_TYPE.BUTTERFLY)
			{
				// Butterfly is interpolating: We just copy the verts as-is:

				var replacementVert = new vertex(
					this._vertices[currentVert]._position[0],
					this._vertices[currentVert]._position[1],
					this._vertices[currentVert]._position[2],
					this._vertices[currentVert]._vertIndex
				);

				// Finally, add the copied vert to our new vertex array:
				newVerts[currentVert] = replacementVert;
			}
		}
		
		// Track which first empty index of the new vertex table we're inserting into
		var nextNewVertIndex = this._vertices.length;	

		// Subdivide existing edges of each face:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
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

				var newVertPosition = vec3.create();

				if (subdivisionMode == SUBDIVISION_TYPE.LOOP)
				{
					// Apply the edge rule to the start/end verts:
					var scaledStartEndPositions = vec3.create();
					vec3.add(scaledStartEndPositions, currentEdge._vertOrigin._position, currentEdge._vertDest._position);
					vec3.scale(scaledStartEndPositions, scaledStartEndPositions, THREE_OVER_EIGHT);

					// Apply the edge rule to the "side" verts:
					var scaledSideVerts = vec3.create();
					var inverseEdge = this.getInverseEdge(currentEdge);
					vec3.add(scaledSideVerts, currentEdge._edgeLeftCCW._vertDest._position, inverseEdge._edgeLeftCCW._vertDest._position);
					vec3.scale(scaledSideVerts, scaledSideVerts, ONE_OVER_EIGHT);

					vec3.add(newVertPosition, scaledStartEndPositions, scaledSideVerts);
				}
				else if (subdivisionMode == SUBDIVISION_TYPE.BUTTERFLY)
				{
					var currentOriginDegree = this.getVertexDegree(currentEdge._vertOrigin._vertIndex);
					var currentDestDegree 	= this.getVertexDegree(currentEdge._vertDest._vertIndex);

					// Handle regular verts:
					if (currentOriginDegree == 6 && currentDestDegree == 6)
					{
						// Start/edge verts:
						vec3.add(newVertPosition, currentEdge._vertOrigin._position, currentEdge._vertDest._position);
						vec3.scale(newVertPosition, newVertPosition, ONE_OVER_TWO);

						var inverseEdge = this.getInverseEdge(currentEdge);

						// "Side" verts:
						var scaledSideVerts = vec3.create();
						vec3.add(scaledSideVerts, currentEdge._edgeLeftCCW._vertDest._position, inverseEdge._edgeLeftCCW._vertDest._position);
						vec3.scale(scaledSideVerts, scaledSideVerts, ONE_OVER_EIGHT);

						vec3.add(newVertPosition, newVertPosition, scaledSideVerts);

						// Diagonal verts:
						var scaledDiagonalVerts = vec3.create();

						// Top right:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge(currentEdge._edgeLeftCCW)._edgeLeftCCW._vertDest._position);

						// Top left:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge(currentEdge._edgeLeftCCW._edgeLeftCCW)._edgeLeftCCW._vertDest._position);

						// Bottom left:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge( this.getInverseEdge(currentEdge)._edgeLeftCCW )._edgeLeftCCW._vertDest._position);

						// Bottom right:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge( this.getInverseEdge(currentEdge)._edgeLeftCCW._edgeLeftCCW )._edgeLeftCCW._vertDest._position);
						vec3.scale(scaledDiagonalVerts, scaledDiagonalVerts, NEG_ONE_OVER_SIXTEEN);

						vec3.add(newVertPosition, newVertPosition, scaledDiagonalVerts);
					
					}
					else if (currentOriginDegree != 6 && currentDestDegree != 6)
					{
						// Handle irregular verts at both ends: Take the average of applying the rules to both endpoints:

						var neighbors 	= this.getVertexNeighbors(currentEdge._vertDest._vertIndex);
						var result1		= this.getButterflyWeightedVertex(neighbors, currentEdge._vertOrigin, currentEdge._vertDest);

						neighbors 		= this.getVertexNeighbors(currentEdge._vertOrigin._vertIndex);
						var result2 	= this.getButterflyWeightedVertex(neighbors, currentEdge._vertDest, currentEdge._vertOrigin);
						
						// Average the result:
						vec3.add(newVertPosition, result1, result2);
						vec3.scale(newVertPosition, newVertPosition, 0.5);

					}
					else // Handle edges with 1 regular vert:
					{
						var theRegularVert;
						var theIrregularVert;

						var neighbors;
						if (currentOriginDegree == 6)
						{
							neighbors = this.getVertexNeighbors(currentEdge._vertDest._vertIndex);

							theRegularVert 		= currentEdge._vertOrigin;
							theIrregularVert 	= currentEdge._vertDest;
						}
						else //currentDestDegree == 6
						{
							neighbors = this.getVertexNeighbors(currentEdge._vertOrigin._vertIndex);

							theRegularVert 		= currentEdge._vertDest;
							theIrregularVert 	= currentEdge._vertOrigin;
						}

						newVertPosition = this.getButterflyWeightedVertex(neighbors, theRegularVert, theIrregularVert);
					}			
				}

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

				var newFace 		= new face();
				newFace._edge 		= currentEdge._children[0];
				newFace._faceIndex 	= newFaces.length;
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

				// Link the left face pointers:
				prevEdge._children[1]._faceLeft 	= newFace;
				newEdge._faceLeft 					= newFace;
				currentEdge._children[0]._faceLeft 	= newFace;

				inverseNewEdge._faceRight = newFace;

				// Update the inverse edge face pointers
				newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._faceRight = newFace;
				prevEdge._children[1]._faceRight = newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._faceLeft;

				newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._faceRight = newFace;
				currentEdge._children[0]._faceRight = newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._faceLeft;

				// Compute the face normal:
				newFace.computeFaceNormal(false);

				// TODO: Compute and upload valid UVs. For now, we just duplicate the parent face
				newFace._uvs 		= this._faces[currentFace]._uvs;

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
			} while (currentEdge != startEdge);

			// Create the inner face:
			var newFace 	= new face();
			newFace._edge 	= createdInverseEdges[0];
		
			// Update the pointers for the new face:
			for (var currentEdge = 0; currentEdge < createdInverseEdges.length; currentEdge++)
			{
				createdEdges[currentEdge]._faceRight 		= newFace;
				createdInverseEdges[currentEdge]._faceLeft 	= newFace;

				var nextEdgeIndex	= (currentEdge + 1) % 3;	// next/prev w.r.t CCW
				var prevEdgeIndex	= currentEdge == 0 ? 2 : ((currentEdge - 1) % 3);

				createdInverseEdges[currentEdge]._edgeLeftCCW 	= createdInverseEdges[nextEdgeIndex];
				createdInverseEdges[currentEdge]._edgeLeftCW 	= createdInverseEdges[prevEdgeIndex];
			}

			// Compute the face normal:
			newFace.computeFaceNormal(false);

			// TODO: Compute and upload valid UVs. For now, we just duplicate the parent face
			newFace._uvs 		= this._faces[currentFace]._uvs;

			// Finally, store the inner face:
			newFace._faceIndex = newFaces.length;
			newFaces.push(newFace);

		} // end faces loop

		// Store the results:
		this._faces 	= newFaces;
		this._edges 	= newEdges;
		this._vertices 	= newVerts;

		this._vertexDegreesAreDirty 	= true;		// Mark the vertex degree count as dirty to ensure we recalculate the degrees
		this._numEdgesIsDirty 		= true;		// Mark the edges table as dirty

		// Compute smooth normals:
		this.computeSmoothNormals();

		// Finally, re-initialize the render object mesh's vertex buffers:
        this.initializeBuffers();

		if (DEBUG_ENABLED)
		{
			this.validateMesh();
		}
	}


	// Butterfly subdivision helper: Get a blended vertex positon
	getButterflyWeightedVertex(neighbors, theRegularVert, theIrregularVert)
	{
		var newVertPosition = vec3.create();

		if (neighbors.length == 3) // K = 3:
		{
			// S0:
			vec3.scale(newVertPosition, theRegularVert._position, FIVE_OVER_TWELVE);

			// S1,2:
			var weightedNeighbors = vec3.create();
			for (var currentNeighbor = 0; currentNeighbor < neighbors.length; currentNeighbor++)
			{
				if (neighbors[currentNeighbor]._vertIndex != theRegularVert._vertIndex)
				{
					vec3.add(weightedNeighbors, weightedNeighbors, neighbors[currentNeighbor]._position);	
				}				
			}
			vec3.scale(weightedNeighbors, weightedNeighbors, NEG_ONE_OVER_TWELVE);

			// Combine weighted contributions:
			vec3.add(newVertPosition, newVertPosition, weightedNeighbors);

			// Current position:
			var scaledCurrentVertex = vec3.create();
			vec3.scale(scaledCurrentVertex, theIrregularVert._position, THREE_OVER_FOUR);
			vec3.add(newVertPosition, newVertPosition, scaledCurrentVertex);
		}
		else if (neighbors.length == 4)	// K = 4:
		{
			// S0:
			vec3.scale(newVertPosition, theRegularVert._position, THREE_OVER_EIGHT);		

			// S2: Find the "center" edge:
			var toExtraordinary = this._edges[theRegularVert._vertIndex][theIrregularVert._vertIndex];

			var weightedNeighbors = vec3.create();
			vec3.scale(weightedNeighbors, this.getInverseEdge(toExtraordinary._edgeLeftCCW)._edgeLeftCCW._vertDest._position, NEG_ONE_OVER_EIGHT);

			// Combine weighted contributions:
			vec3.add(newVertPosition, newVertPosition, weightedNeighbors);

			// Current position:
			var scaledCurrentVertex = vec3.create();
			vec3.scale(scaledCurrentVertex, theIrregularVert._position, THREE_OVER_FOUR);
			vec3.add(newVertPosition, newVertPosition, scaledCurrentVertex);
		}
		else if (neighbors.length >= 5) // K > =5:
		{
			var K = neighbors.length + 1;

			// S0:
			var weight = (1.0 / K) * (ONE_OVER_FOUR + 1.0 + ONE_OVER_TWO );
			var weightedRegularVert = vec3.create();							
			vec3.scale(weightedRegularVert, theRegularVert._position, weight);
			vec3.add(newVertPosition, newVertPosition, weightedRegularVert);
			
			var totalWeights = 0;

			// S1-(K-1)
			for (var currentNeighbor = 0; currentNeighbor < neighbors.length; currentNeighbor++)
			{
				var j = currentNeighbor + 1;

				var weight = (1.0 / K) * (ONE_OVER_FOUR + ( Math.cos( (j * TWO_PI) / K) ) + (ONE_OVER_TWO * Math.cos( (j * FOUR_PI) / K )) );

				totalWeights += weight;

				// Find the correct neighbor:
				var toExtraordinary 		= this._edges[theRegularVert._vertIndex][theIrregularVert._vertIndex];
				var inverseToExtraordinary 	= this.getInverseEdge(toExtraordinary);

				var toNeighbor = this.getInverseEdge(inverseToExtraordinary._edgeLeftCW);
				for(var currentTurn = 0; currentTurn < currentNeighbor; currentTurn++)
				{
					toNeighbor = this.getInverseEdge(toNeighbor._edgeLeftCW);
				}

				var currentWeightedNeighbor = vec3.create();
				vec3.scale(currentWeightedNeighbor, toNeighbor._vertDest._position, weight);

				// Combine weighted contributions:
				vec3.add(newVertPosition, newVertPosition, currentWeightedNeighbor);
			}

			// Current position:
			var scaledCurrentVertex = vec3.create();
			vec3.scale(scaledCurrentVertex, theIrregularVert._position, THREE_OVER_FOUR);
			vec3.add(newVertPosition, newVertPosition, scaledCurrentVertex);
		}

		return newVertPosition;
	}


	// Convert a mesh to OBJ format for download:
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
			var currentEdge 		= this._faces[currentFace]._edge;
			var currentVert = 0;
			for (var i = 0; i < 3; i++)
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
			}

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

			// Process each vert for the edges about the current face:
			for (var currentVert = 0; currentVert < 3; currentVert++)
			{
				// Push the current origin vertex, looping over the x, y, z coords:
				for (var currentElement = 0; currentElement < 3; currentElement++)
				{
					this._positionData.push(currentEdge._vertOrigin._position[currentElement]);

					this._wireframePositionsData.push(currentEdge._vertOrigin._position[currentElement]);

					this._OBJNormalsData.push( this._faces[currentFace]._normals[currentVert][currentElement] );

					this._smoothNormalsData.push(currentEdge._vertOrigin._smoothedNormal[currentElement]);

					// TODO: Handle UVs
				}

				// Also push the destination vertex to the wireframe buffer, as we require 2 points per line when using gl.LINES mode:
				for (var currentElement = 0; currentElement < 3; currentElement++)
				{
					this._wireframePositionsData.push(currentEdge._vertDest._position[currentElement]);
				}

				// Visual debugging: Color the wireframe
				if (DEBUG_ENABLED && DEBUG_SPECIFY_EDGES)
				{
					if (debugEdgeIndex < debugEdgeVerts.length)
					{
						var origin 	= debugEdgeVerts[debugEdgeIndex][0];	// GREEN
						var dest 	= debugEdgeVerts[debugEdgeIndex][1];	// BLUE
						
						if (currentEdge._vertOrigin._vertIndex == origin && currentEdge._vertDest._vertIndex == dest) // The actual edge
						{
							this._colorData.push(0.0, 1.0, 0.0, 1.0);	// GREEN
							this._colorData.push(0.0, 0.0, 1.0, 1.0);	// BLUE
						}
						else if (currentEdge._vertOrigin._vertIndex == dest && currentEdge._vertDest._vertIndex == origin)	// The inverse edge
						{
							this._colorData.push(0.0, 0.0, 1.0, 1.0);	// BLUE
							this._colorData.push(0.0, 1.0, 0.0, 1.0);	// GREEN
						}
						else if (currentEdge._vertOrigin._vertIndex == origin)	// Outgoing edge
						{
							this._colorData.push(0.0, 1.0, 0.0, 1.0);	// GREEN
							this._colorData.push(1.0, 1.0, 1.0, 1.0);	// Original color...
						}
						else if (currentEdge._vertDest._vertIndex == origin)	// Arriving edge
						{
							this._colorData.push(1.0, 1.0, 1.0, 1.0);	// Original color...
							this._colorData.push(0.0, 1.0, 0.0, 1.0);	// GREEN
						}
						else if (currentEdge._vertOrigin._vertIndex == dest)
						{
							this._colorData.push(0.0, 0.0, 1.0, 1.0);	// BLUE
							this._colorData.push(1.0, 1.0, 1.0, 1.0);	// Original color...
						}
						else if(currentEdge._vertDest._vertIndex == dest)
						{
							this._colorData.push(1.0, 1.0, 1.0, 1.0);	// Original color...
							this._colorData.push(0.0, 0.0, 1.0, 1.0);	// BLUE
						}
						else
						{
							this._colorData.push(1.0, 1.0, 1.0, 1.0);	// Original color...
							this._colorData.push(1.0, 1.0, 1.0, 1.0);
						}

					}	
					else
					{
						this._colorData.push(1.0, 1.0, 1.0, 1.0);	// Original color...
						this._colorData.push(1.0, 1.0, 1.0, 1.0);
					}
				}
				else // Non-debug behavior:
				{
					// Push the wireframe colors: We need an entry for both verts:
					this._colorData.push(1.0, 0.0, 0.0, 1.0);
					this._colorData.push(1.0, 0.0, 0.0, 1.0);
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
    bindBuffers(gl, wireframeMode = false)
    {		
        // Configure the vertex buffers:
		if (wireframeMode == true)
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
			case SHADING_MODE.SMOOTH:
			case SHADING_MODE.SHADED_WIREFRAME:
			{
				gl.bindBuffer(gl.ARRAY_BUFFER, this._smoothNormalsBuffer);
			}
			break;

			case SHADING_MODE.FLAT:
			case SHADING_MODE.WIREFRAME:
			default:
			{
				gl.bindBuffer(gl.ARRAY_BUFFER, this._OBJNormalsBuffer);
			}
		}

		if (wireframeMode == true)
		{
			gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
			gl.vertexAttribPointer(
				gl.getAttribLocation(this._material._wireframeShader._shaderProgram, 'in_vertexColor'),
				4,          // Number of components: # values per iteration
				gl.FLOAT,   // Type
				false,      // Normalize the data?
				0,          // Stride
				0           // Starting offset
			);
			gl.enableVertexAttribArray(gl.getAttribLocation(this._material._wireframeShader._shaderProgram, 'in_vertexColor'));
		}
		else
		{
			gl.vertexAttribPointer(
				gl.getAttribLocation(this._material._shader._shaderProgram, 'in_normal'),
				3,          // Number of components: # values per iteration
				gl.FLOAT,   // Type
				false,      // Normalize the data?
				0,          // Stride
				0           // Starting offset
			);
			gl.enableVertexAttribArray(gl.getAttribLocation(this._material._shader._shaderProgram, 'in_normal'));
		}
    }


	// DEBUG: Sanity check the mesh
	validateMesh()
	{
		if (!DEBUG_ENABLED)
		{
			return;
		}

		console.log("VALIDATING MESH");

		// Check the vertex indexes:
		for (var c = 0; c < this._vertices.length; c++)
		{
			if (this._vertices[c] == null)
			{
				// console.log("Vertex at index " + c + " is null, skipping...");
				continue;
			}
			if (this._vertices[c]._vertIndex != c)
			{
				console.log("ERROR: Vertex at table index " + c + " has a mismatching index " + this._vertices[c]._vertIndex);
				DEBUG_ERROR_HAS_OCCURRED = true;
			}
		}

		// Count the verts
		var vertCount = [];
		var validVerts = 0;
		for (var c = 0; c < this._vertices.length; c++)
		{
			if (this._vertices[c] != null)
			{
				validVerts++;
			}

			vertCount.push(0);	// Fill array with 0's
		}
		for (var row = 0; row < this._edges[0].length; row++)
		{
			for (var col = 0; col < this._edges[0].length; col++)
			{
				if (this._edges[row][col] != null)
				{
					vertCount[ this._edges[row][col]._vertOrigin._vertIndex ] 	= 1;
					vertCount[ this._edges[row][col]._vertDest._vertIndex ] 	= 1;
				}
			}
		}
		var totalVerts = 0;
		for (var c = 0; c < vertCount.length; c++)
		{
			if (vertCount[c] != 0)
			{
				totalVerts++;
			}
		}
		if (totalVerts != validVerts)
		{
			console.log("ERROR: The mesh edges refer to " + totalVerts + " vertices (count table size = " + vertCount.length + "), but only " + validVerts + " valid verts were counted within the vertex array's " + this._vertices.length + " elements");
			DEBUG_ERROR_HAS_OCCURRED = true;

			var vertStr = "Non-referenced vert indexes = ";
			for (var c = 0; c < vertCount.length; c++)
			{
				if (vertCount[c] == 0)
				{
					vertStr += c + ", ";
				}
			}
			console.log(vertStr);
		}

		// Check the edges against the vertex table:
		for (var row = 0; row < this._edges[0].length; row++)
		{
			for (var col = 0; col < this._edges[0].length; col++)
			{
				if (this._edges[row][col] != null)
				{
					if (this._edges[row][col]._vertOrigin != this._vertices[ this._edges[row][col]._vertOrigin._vertIndex ])
					{
						console.log("ERROR: Edge has a origin vertex reference that does not match the vertex table");
						DEBUG_ERROR_HAS_OCCURRED = true;
					}

					if (this._edges[row][col]._vertDest != this._vertices[ this._edges[row][col]._vertDest._vertIndex ])
					{
						console.log("ERROR: Edge has a dest vertex reference that does not match the vertex table");
						DEBUG_ERROR_HAS_OCCURRED = true;
					}
				}
			}
		}

		// Check the edges table against the face edge loops:
		var edgeParity = [];
		for (var currentRow = 0; currentRow < this._edges.length; currentRow++)
		{
			edgeParity.push(new Array());
			for (var currentCol = 0; currentCol < this._edges.length; currentCol++)
			{
				edgeParity[currentRow].push(null);
			}
		}
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			if (this._faces[currentFace] == null)
			{
				console.log("Found null face, skipping...");
				continue;
			}
			var start = this._faces[currentFace]._edge;
			var cur = start;
			var count = 0;
			do
			{
				edgeParity[cur._vertOrigin._vertIndex][cur._vertDest._vertIndex] = cur;

				// Just use the actual inverse for now...
				edgeParity[cur._vertDest._vertIndex][cur._vertOrigin._vertIndex] = this.getInverseEdge(cur);

				cur = cur._edgeLeftCCW;
				count++;

				if (count > 3)
				{
					console.log("ERROR: Found an edge loop of length > 3 while assembling the edge comparison table");
					DEBUG_ERROR_HAS_OCCURRED = true;
					break;
				}
			} while (cur != start);
		}
		for (var row = 0; row < this._edges[0].length; row++)
		{
			for (var col = 0; col < this._edges[0].length; col++)
			{
				if (this._edges[row][col] != edgeParity[row][col])
				{
					console.log("ERROR: Walking the face edges produces a different edge table: row = " + row + ", col = " + col);
					DEBUG_ERROR_HAS_OCCURRED = true;

					if (this._edges[row][col] == null)
					{
						console.log("Edge table reference is null");
					}
					else
					{
						console.log("Edge table: " + this._edges[row][col]._vertOrigin._vertIndex + " -> " + this._edges[row][col]._vertDest._vertIndex);
					}

					if (edgeParity[row][col] == null)
					{
						console.log("Edge parity table reference is null");
					}
					else
					{
						console.log("Edge Parity table: " + edgeParity[row][col]._vertOrigin._vertIndex + " -> " + edgeParity[row][col]._vertOrigin._vertIndex);
					}				
					
				}
			}
		}

		// Check edge loops:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			if (this._faces[currentFace] == null)
			{
				console.log("Found null face, skipping...");
				continue;
			}

			if (this._faces[currentFace]._edge._edgeLeftCCW._edgeLeftCCW._edgeLeftCCW != this._faces[currentFace]._edge)
			{
				console.log("ERROR: Found non-circular CCW loop");
				DEBUG_ERROR_HAS_OCCURRED = true;
			}

			if (this._faces[currentFace]._edge._edgeLeftCW._edgeLeftCW._edgeLeftCW != this._faces[currentFace]._edge)
			{
				console.log("ERROR: Found non-circular CW loop");
				DEBUG_ERROR_HAS_OCCURRED = true;
			}

			var start = this._faces[currentFace]._edge;
			var cur = start;
			var count = 0;
			do
			{
				if (
					cur._vertOrigin == null ||
					cur._vertDest == null ||
					cur._faceLeft == null ||
					cur._faceRight == null ||
					cur._edgeLeftCCW == null ||
					cur._edgeLeftCW == null
				)
					{
						console.log("ERROR: Found an edge with a null reference on face " + currentFace);
						console.log(cur);
						console.log(cur._vertOrigin);
						console.log(cur._vertDest);
						console.log(cur._faceLeft);
						console.log(cur._faceRight);
						console.log(cur._edgeLeftCCW);
						console.log(cur._edgeLeftCW);
					}

				
					// Check the face index matches the face references:
				if (cur._faceLeft != this._faces[cur._faceLeft._faceIndex])
				{
					console.log("ERROR: Left face of current edge does not match the face in the faces array");
					DEBUG_ERROR_HAS_OCCURRED = true;
				}
				if (cur._faceRight != this._faces[cur._faceRight._faceIndex])
				{
					console.log("ERROR: Right face of current edge does not match the face in the faces array");
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (this._edges[cur._vertOrigin._vertIndex][cur._vertDest._vertIndex] == null)
				{
					console.log("ERROR: Face " + currentFace + " has a FORWARD edge (count = " + count + ")  not in the edges table: " + cur._vertOrigin._vertIndex + " -> " + cur._vertDest._vertIndex);
					console.log(cur);
					console.log(this._edges[cur._vertOrigin._vertIndex][cur._vertDest._vertIndex]);
					// console.log(this._edges);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (this._edges[cur._vertDest._vertIndex][cur._vertOrigin._vertIndex] == null)
				{
					console.log("ERROR: Face " + currentFace + " has a INVERSE edge not in the edges table: " + cur._vertDest._vertIndex + " -> " + cur._vertOrigin._vertIndex);
					console.log(cur);
					// console.log(this._edges);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (this._edges[cur._vertOrigin._vertIndex][cur._vertDest._vertIndex] != cur)
				{
					console.log("ERROR: Face " + currentFace + " has a FORWARD edge reference (count = " + count + ") that is out of sync with the edge table reference. Cur pointer = " + cur._vertOrigin._vertIndex + " -> " + cur._vertDest._vertIndex);
					console.log(cur);
					console.log(this._edges[cur._vertOrigin._vertIndex][cur._vertDest._vertIndex]);
					console.log("Edge table = " + this._edges[cur._vertOrigin._vertIndex][cur._vertDest._vertIndex]._vertOrigin._vertIndex + " -> " + this._edges[cur._vertOrigin._vertIndex][cur._vertDest._vertIndex]._vertDest._vertIndex);
					console.log(cur);
					// console.log(this._edges);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (this._edges[cur._vertDest._vertIndex][cur._vertOrigin._vertIndex] != this.getInverseEdge(cur))
				{
					console.log("ERROR: Face " + currentFace + " has a INVERSE edge reference that is out of sync with the edge table: " + cur._vertDest._vertIndex + " -> " + cur._vertOrigin._vertIndex);
					console.log(cur);
					// console.log(this._edges);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (cur._vertOrigin != this._vertices[cur._vertOrigin._vertIndex])
				{
					console.log("ERROR: Face " + currentFace + " has a FORWARD edge reference with an ORIGIN vertex that does not match the vertex table: " + cur._vertOrigin._vertIndex + " -> " + cur._vertDest._vertIndex + ", " + this._vertices[cur._vertOrigin._vertIndex]);
					console.log(cur);
					// console.log(this._vertices);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (cur._vertDest != this._vertices[cur._vertDest._vertIndex])
				{
					console.log("ERROR: Face " + currentFace + " has a INVERSE edge reference with a DEST vertex that does not match the vertex table: " + cur._vertOrigin._vertIndex + " -> " + cur._vertDest._vertIndex);
					console.log(cur);
					// console.log(this._vertices);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (this.getInverseEdge(cur)._vertOrigin != this._vertices[this.getInverseEdge(cur)._vertOrigin._vertIndex])
				{
					console.log("ERROR: Face " + currentFace + " has a INVERSE edge reference with an ORIGIN vertex that does not match the vertex table: " + this.getInverseEdge(cur)._vertOrigin._vertIndex + " -> " + this.getInverseEdge(cur)._vertDest._vertIndex);
					console.log(this.getInverseEdge(cur));
					// console.log(this._vertices);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (this.getInverseEdge(cur)._vertDest != this._vertices[this.getInverseEdge(cur)._vertDest._vertIndex])
				{
					console.log("ERROR: Face " + currentFace + " has a INVERSE edge reference with an DEST vertex that does not match the vertex table: " + this.getInverseEdge(cur)._vertOrigin._vertIndex + " -> " + this.getInverseEdge(cur)._vertDest._vertIndex + ", " + this._vertices[this.getInverseEdge(cur)._vertDest._vertIndex]);
					console.log(this.getInverseEdge(cur));
					// console.log(this._vertices);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}


				if (cur._vertOrigin != this._vertices[cur._vertOrigin._vertIndex])
				{
					console.log("ERROR: Edge has a ORIGIN vertex that does not match the reference at the same index in the vertices array");
					DEBUG_ERROR_HAS_OCCURRED = true;
				}

				if (cur._vertDest != this._vertices[cur._vertDest._vertIndex])
				{
					console.log("ERROR: Edge has a DEST vertex that does not match the reference at the same index in the vertices array");
					DEBUG_ERROR_HAS_OCCURRED = true;
				}


				count++;
				if (count > 3)
				{
					console.log("ERROR: Found edge loop with length > 3. cur = " + cur._vertOrigin._vertIndex + " -> " + cur._vertDest._vertIndex);
					DEBUG_ERROR_HAS_OCCURRED = true;
					break;
				}
				cur = cur._edgeLeftCCW
			} while (cur != start);

			if (count != 3)
			{
				console.log("ERROR: Face " + currentFace + " has " + count + " edges");
				DEBUG_ERROR_HAS_OCCURRED = true;
			}
		}

		for (var row = 0; row < this._edges[0].length; row++)
		{
			for (var col = 0; col < this._edges[0].length; col++)
			{
				if (this._edges[row][col] == null && this._edges[col][row] != null)
				{
					console.log("EDGE TABLE MISMATCH DETECTED ["+ row + "][" + col + "]!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ");
					console.log(this._edges);
					DEBUG_ERROR_HAS_OCCURRED = true;
				}
			}
		}

		console.log("MESH VALIDATION COMPLETE");
	}


	// DEBUG: Print the mesh
	printMesh()
	{
		if (!DEBUG_ENABLED)
		{
			return;
		}

		console.log("Printing mesh: ");
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			if (this._faces[currentFace] == null)
			{
				console.log("Face index " + currentFace + " is null... Skipping!");
				continue;
			}

			var faceStr = "";
			var start = this._faces[currentFace]._edge;
			var cur = start;
			var count = 0;
			do
			{
				count++;
				if (count > 3)
				{
					console.log("ERROR! " + currentFace + ": " + faceStr);
					break;
				}
				faceStr += "(" + cur._vertOrigin._vertIndex + ", " + cur._vertDest._vertIndex + ") -> ";
				cur = cur._edgeLeftCCW;
			} while (cur != start);
			
			console.log(faceStr);
		}
	}


	// DEBUG: Print an edge loop
	printEdgeLoop(edge, name = "")
	{
		if (!DEBUG_ENABLED)
		{
			return;
		}

		var str = name + ": ";
		var cur = edge;
		var count = 0;
		do
		{
			str += "(" + cur._vertOrigin._vertIndex + ", " + cur._vertDest._vertIndex + ") -> ";
			cur = cur._edgeLeftCCW;

			count++;

			if (count >= 6)
			{
				str = "ERROR: Oversized edge loop detected: " + str;
				break;
			}
		} while (cur != edge);

		console.log(str);
	}


	// DEBUG: Print the edge table
	printEdges()
	{
		if (!DEBUG_ENABLED)
		{
			return;
		}

		console.log("Printing edges:");
		for (var row = 0; row < this._edges[0].length; row++)
		{
			for (var col = 0; col < this._edges[0].length; col++)
			{
				if (this._edges[row][col] != null)
				{
					console.log("Edges[" + row + "][" + col + "] = " + this._edges[row][col]._vertOrigin._vertIndex +  ", " + this._edges[row][col]._vertDest._vertIndex);
				}				
			}
		}
	}


	// DEBUG: Print the vertices table
	printVerts()
	{
		if (!DEBUG_ENABLED)
		{
			return;
		}

		console.log("There are " + this._vertices.length + " vertices:");
		for (var v = 0; v < this._vertices.length; v++)
		{
			var vertIdx = (this._vertices[v] == null) ? "null" : v;
			console.log("[" + v + "] = " +  vertIdx);
		}
	}
}