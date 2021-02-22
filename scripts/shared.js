// Shared values and helpers

// CMPT 764 Assignment 1
// by Adam Badke
// SFU Student #301310785
// abadke@sfu.ca


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
}


// Transform class
// Shared by various render and scene objects
class transform
{
    _position        = [0.0, 0.0, 0.0];
    _rotation        = quat.create();
    _scale           = [1.0, 1.0, 1.0];

    _rotationEuler   = [0.0, 0.0, 0.0];

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
                    this._position[0] = transformVal;
                }
            break;
    
            case TRANSFORM_TYPE.TRANSLATE_Y:
                {
                    this._position[1] = transformVal;
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
                this._rotationEuler[0] = transformVal;
                quat.fromEuler(this._rotation, this._rotationEuler[0], this._rotationEuler[1], this._rotationEuler[2]);
            }
            break;

            case TRANSFORM_TYPE.ROTATE_Y:
            {
                this._rotationEuler[1] = transformVal;
                quat.fromEuler(this._rotation, this._rotationEuler[0], this._rotationEuler[1], this._rotationEuler[2]);
            }
            break;

            case TRANSFORM_TYPE.ROTATE_Z:
            {
                this._rotationEuler[2] = transformVal;
                quat.fromEuler(this._rotation, this._rotationEuler[0], this._rotationEuler[1], this._rotationEuler[2]);
            }
            break;

            // SCALE:
            case TRANSFORM_TYPE.SCALE_X:
            {
                this._scale[0] = transformVal;
            }
            break;

            case TRANSFORM_TYPE.SCALE_Y:
            {
                this._scale[1] = transformVal;
            }
            break;

            case TRANSFORM_TYPE.SCALE_Z:
            {
                this._scale[2] = transformVal;
            }
            break;
            
            default:
                console.log("[transform::updateTransform] Invalid transformation type received!");
        }
    }
}