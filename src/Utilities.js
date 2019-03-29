/**
 * Wrapper for {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/viewer3d|Viewer3D}
 * with a collection of helpful methods that are not (yet) part of the official API.
 * @namespace Autodesk.Viewing
 */
class Utilities {

    /**
     * Callback function used to report access token to the viewer.
     * @callback AccessTokenCallback
     * @param {string} token Access token.
     * @param {int} expires Number of seconds after which the token expires.
     */

    /**
     * Callback function used by the viewer to request new access token.
     * @callback AccessTokenRequest
     * @param {AccessTokenCallback} callback Access token callback.
     */

    /**
     * Initializes new instance of {@link Utilities}, including the initialization
     * of the underlying {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/viewer3d|Viewer3D}.
     * @param {HTMLElement} container Target container for the viewer canvas.
     * @param {AccessTokenRequest} getAccessToken Function that will be called by the viewer
     * whenever a new access token is required.
     * @returns {Promise<Utilities>} Promise that will be either resolved with {@link Utilities} instance,
     * or rejected with an error message.
     * 
     * @example <caption>Using Promises</caption>
     * function getAccessToken(callback) {
     *   fetch('/api/forge/auth/token')
     *     .then(resp => resp.json())
     *     .then(json => callback(json.access_token, json.expires_in));
     * }
     * Autodesk.Viewing.Utilities.Initialize(document.getElementById('viewer'), getAccessToken)
     *   .then(utils => console.log(utils));
     * 
     * @example <caption>Using Async/Await</caption>
     * async function getAccessToken(callback) {
     *   const resp = await fetch('/api/forge/auth/token');
     *   const json = await resp.json();
     *   callback(json.access_token, json.expires_in);
     * }
     * async function init() {
     *   const utils = await Autodesk.Viewing.Utilities.Initialize(document.getElementById('viewer'), getAccessToken);
     *   console.log(utils);
     * }
     * init();
     */
    static Initialize(container, getAccessToken) {
        return new Promise(function(resolve, reject) {
            const options = {
                getAccessToken
            };
            Autodesk.Viewing.Initializer(options, function() {
                const viewer = new Autodesk.Viewing.Private.GuiViewer3D(container);
                viewer.start();
                resolve(new Autodesk.Viewing.Utilities(viewer));
            });
        });
    }

    /**
     * Initializes {@link Utilities} with existing instance
     * of {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/viewer3d|Viewer3D}.
     * @param {Viewer3D} viewer Forge viewer.
     */
    constructor(viewer) {
        this.viewer = viewer;
        this.impl = viewer.impl;
    }

    /**
     * Viewable, also referred to as "bubble node", is a singular viewable
     * item from a document that has been generated by {@link https://forge.autodesk.com/en/docs/model-derivative/v2|Model Derivative API}.
     * For example, submitting a Revit file into the service will generate
     * a single document identified by its unique, base-64 encoded *urn*,
     * and the document will include a hierarchy of various *viewables* such
     * as thumbnails, 3D scenes for individual camera views, or 2D scenes
     * for individual Revit sheets.
     * @typedef {object} Viewable
     * @property {Viewable} parent Parent of the viewable in the document hierarchy.
     * @property {Viewable[]} children Children of the viewable in the document hierarchy.
     * @property {number} id Internal viewable ID.
     * @property {boolean} isLeaf Indicates that the viewable has no children.
     * @property {object} data Additional viewable properties such as *guid* (unique, string identifier),
     * *name*, *role*, *type*, etc.
     */

    /**
     * Loads {@link Viewable} into the viewer.
     * @param {string} documentUrn Base64-encoded identifier of the document.
     * @param {string|number} [viewableId=0] Optional GUID (string) or index (number) of the viewable within the document.
     * @returns {Promise<Viewable>} Promise that will be either resolved with {@link Viewable} structure,
     * or rejected with an error message.
     *
     * @example
     * async function loadDocument(urn) {
     *   const viewable = await utils.load(urn);
     *   console.log('Loaded viewable', viewable.data.id);
     * }
     */
    load(documentUrn, viewableId = 0) {
        const viewer = this.viewer;
        return new Promise(function(resolve, reject) {    
            function onDocumentLoadSuccess(doc) {
                if (typeof viewableId === 'string') {
                    const viewable = doc.getRoot().findByGuid(viewableId);
                    if (viewable) {
                        viewer.loadDocumentNode(doc, viewable);
                        resolve(viewable);
                    } else {
                        reject(`Viewable ${viewableId} not found.`);
                    }
                } else {
                    const viewables = doc.getRoot().search({ type: 'geometry' });
                    if (viewableId < viewables.length) {
                        const viewable = viewables[viewableId];
                        viewer.loadDocumentNode(doc, viewable);
                        resolve(viewable);
                    } else {
                        reject(`Viewable ${viewableId} not found.`);
                    }
                }
            }
            function onDocumentLoadError(errorCode, errorMsg) {
                reject(`Document loading error: ${errorMsg} (${errorCode})`);
            }
            Autodesk.Viewing.Document.load('urn:' + documentUrn, onDocumentLoadSuccess, onDocumentLoadError);
        });
    }

    /**
     * Object returned by ray casting methods for each scene object under the given canvas coordinates.
     * @typedef {object} Intersection
     * @property {number} dbId Internal ID of the scene object.
     * @property {number} distance Distance of the intersection point from camera. All intersections
     * returned by the ray casting method are sorted from the smallest distance to the largest.
     * @property {THREE.Face3} face {@link https://threejs.org/docs/#api/en/core/Face3|Face3} object
     * representing the triangular mesh face that has been intersected.
     * @property {number} faceIndex Index of the intersected face, if available.
     * @property {number} fragId ID of Forge Viewer *fragment* that was intersected.
     * @property {THREE.Vector3} intersectPoint {@link https://threejs.org/docs/#api/en/core/Vector3|Vector3} point of intersection.
     * @property {THREE.Vector3} point Same as *intersectPoint*.
     * @property {Model} model Forge Viewer {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/model|Model} that was intersected.
     */

    /**
     * Finds all scene objects on specific X,Y position on the canvas.
     * @param {number} x X-coordinate, i.e., horizontal distance (in pixels) from the left border of the canvas.
     * @param {number} y Y-coordinate, i.e., vertical distance (in pixels) from the top border of the canvas.
     * @returns {Intersection[]} List of intersections.
     * 
     * @example
     * document.getElementById('viewer').addEventListener('click', function(ev) {
     *   const bounds = ev.target.getBoundingClientRect();
     *   const intersections = utils.rayCast(ev.clientX - bounds.left, ev.clientY - bounds.top);
     *   if (intersections.length > 0) {
     *     console.log('hit', intersections[0]);
     *   } else {
     *     console.log('miss');
     *   }
     * });
     */
    rayCast(x, y) {
        let intersections = [];
        this.impl.castRayViewport(this.impl.clientToViewport(x, y), false, null, null, intersections);
        return intersections;
    }

    /**
     * Inserts custom {@link https://threejs.org/docs/#api/en/objects/Mesh|Mesh} into
     * *overlay* scene of given name. An overlay scene is always rendered *after*
     * the main scene with the Forge Viewer model.
     * @param {THREE.Mesh} mesh Custom {@link https://threejs.org/docs/#api/en/objects/Mesh|Mesh}.
     * @param {string} [overlay='UtilitiesOverlay'] Name of the overlay scene.
     *
     * @example
     * const geometry = new THREE.SphereGeometry(10, 8, 8);
     * const material = new THREE.MeshBasicMaterial({ color: 0x336699 });
     * const mesh = new THREE.Mesh(geometry, material);
     * mesh.position.x = 1.0; mesh.position.y = 2.0; mesh.position.z = 3.0;
     * utils.addCustomMesh(mesh, 'myOverlay');
     */
    addCustomMesh(mesh, overlay = 'UtilitiesOverlay') {
        if (!this.impl.overlayScenes[overlay]) {
            this.impl.createOverlayScene(overlay);
        }
        this.impl.addOverlay(overlay, mesh);
    }

    /**
     * Removes custom {@link https://threejs.org/docs/#api/en/objects/Mesh|Mesh} from
     * *overlay* scene of given name. An overlay scene is always rendered *after*
     * the main scene with the Forge Viewer model.
     * @param {THREE.Mesh} mesh {@link https://threejs.org/docs/#api/en/objects/Mesh|Mesh} to be removed.
     * @param {string} [overlay='UtilitiesOverlay'] Name of the overlay scene.
     * 
     * @example
     * // after adding a mesh using addCustomMesh
     * utils.removeCustomMesh(mesh, 'myOverlay');
     */
    removeCustomMesh(mesh, overlay = 'UtilitiesOverlay') {
        if (!this.impl.overlayScenes[overlay]) {
            this.impl.createOverlayScene(overlay);
        }
        this.impl.removeOverlay(overlay, mesh);
    }

    /**
     * Callback function used when enumerating scene objects.
     * @callback NodeCallback
     * @param {number} id Object ID.
     */

    /**
     * Enumerates IDs of objects in the scene.
     *
     * To make sure the method call is synchronous (i.e., it returns *after*
     * all objects have been enumerated), always wait until the object tree
     * has been loaded.
     *
     * @param {NodeCallback} callback Function called for each object.
     * @param {number?} [parent = undefined] ID of the parent object whose children
     * should be enumerated. If undefined, the enumeration includes all scene objects.
     * @throws Exception if no {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/model|Model} is loaded.
     *
     * @example
     * viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, function() {
     *   try {
     *     utils.enumerateNodes(function(id) {
     *       console.log('Found node', id);
     *     });
     *   } catch(err) {
     *     console.error('Could not enumerate nodes', err);
     *   }
     * });
     */
    enumerateNodes(callback, parent = undefined) {
        function onSuccess(tree) {
            if (typeof parent === 'undefined') {
                parent = tree.getRootId();
            }
            tree.enumNodeChildren(parent, callback, true);
        }
        function onError(err) { throw new Error(err); }
        this.viewer.getObjectTree(onSuccess, onError);
    }

    /**
     * Lists IDs of objects in the scene.
     * @param {number?} [parentId = undefined] ID of the parent object whose children
     * should be listed. If undefined, the list will include all scene object IDs.
     * @returns {Promise<number[]>} Promise that will be resolved with a list of IDs,
     * or rejected with an error message, for example, if there is no
     * {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/model|Model}.
     *
     * @example <caption>Using async/await</caption>
     * viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, async function() {
     *   const ids = await utils.listNodes();
     *   console.log('Object IDs', ids);
     * });
     */
    listNodes(parentId = undefined) {
        const viewer = this.viewer;
        return new Promise(function(resolve, reject) {
            function onSuccess(tree) {
                if (typeof parentId === 'undefined') {
                    parentId = tree.getRootId();
                }
                let ids = [];
                tree.enumNodeChildren(parentId, function(id) { ids.push(id); }, true);
                resolve(ids);
            }
            function onError(err) { reject(err); }
            viewer.getObjectTree(onSuccess, onError);
        });
    }

    /**
     * Enumerates IDs of leaf objects in the scene.
     *
     * To make sure the method call is synchronous (i.e., it returns *after*
     * all objects have been enumerated), always wait until the object tree
     * has been loaded.
     *
     * @param {NodeCallback} callback Function called for each object.
     * @param {number?} [parent = undefined] ID of the parent object whose children
     * should be enumerated. If undefined, the enumeration includes all leaf objects.
     * @throws Exception if no {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/model|Model} is loaded.
     *
     * @example
     * viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, function() {
     *   try {
     *     utils.enumerateLeafNodes(function(id) {
     *       console.log('Found leaf node', id);
     *     });
     *   } catch(err) {
     *     console.error('Could not enumerate nodes', err);
     *   }
     * });
     */
    enumerateLeafNodes(callback, parent = undefined) {
        let tree = null;
        function onNode(id) { if (tree.getChildCount(id) === 0) callback(id); }
        function onSuccess(_tree) {
            tree = _tree;
            if (typeof parent === 'undefined') {
                parent = tree.getRootId();
            }
            tree.enumNodeChildren(parent, onNode, true);
        }
        function onError(err) { throw new Error(err); }
        this.viewer.getObjectTree(onSuccess, onError);
    }

    /**
     * Lists IDs of leaf objects in the scene.
     * @param {number?} [parentId = undefined] ID of the parent object whose children
     * should be listed. If undefined, the list will include all leaf object IDs.
     * @returns {Promise<number[]>} Promise that will be resolved with a list of IDs,
     * or rejected with an error message, for example, if there is no
     * {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/model|Model}.
     *
     * @example <caption>Using async/await</caption>
     * viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, async function() {
     *   const ids = await utils.listLeafNodes();
     *   console.log('Leaf object IDs', ids);
     * });
     */
    listLeafNodes(parentId = undefined) {
        const viewer = this.viewer;
        return new Promise(function(resolve, reject) {
            let tree = null;
            let ids = [];
            function onSuccess(_tree) {
                tree = _tree;
                if (typeof parentId === 'undefined') {
                    parentId = tree.getRootId();
                }
                tree.enumNodeChildren(parentId, function(id) { if (tree.getChildCount(id) === 0) ids.push(id); }, true);
                resolve(ids);
            }
            function onError(err) { reject(err); }
            viewer.getObjectTree(onSuccess, onError);
        });
    }

    /**
     * Callback function used when enumerating scene fragments.
     * @callback FragmentCallback
     * @param {number} id Fragment ID.
     */

    /**
     * Enumerates fragment IDs of specific object or entire scene.
     *
     * To make sure the method call is synchronous (i.e., it returns *after*
     * all fragments have been enumerated), always wait until the object tree
     * has been loaded.
     *
     * @param {FragmentCallback} callback Function called for each fragment.
     * @param {number?} [parent = undefined] ID of the parent object whose fragments
     * should be enumerated. If undefined, the enumeration includes all scene fragments.
     * @throws Exception if no {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/model|Model} is loaded.
     *
     * @example
     * viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, function() {
     *   try {
     *     utils.enumerateFragments(function(id) {
     *       console.log('Found fragment', id);
     *     });
     *   } catch(err) {
     *     console.error('Could not enumerate fragments', err);
     *   }
     * });
     */
    enumerateFragments(callback, parent = undefined) {
        function onSuccess(tree) {
            if (typeof parent === 'undefined') {
                parent = tree.getRootId();
            }
            tree.enumNodeFragments(parent, callback, true);
        }
        function onError(err) { throw new Error(err); }
        this.viewer.getObjectTree(onSuccess, onError);
    }

    /**
     * Lists fragments IDs of specific scene object.
     * Should be called *after* the object tree has been loaded.
     * @param {number?} [parentId = undefined] ID of the parent object whose fragments
     * should be listed. If undefined, the list will include all fragment IDs.
     * @returns {Promise<number[]>} Promise that will be resolved with a list of IDs,
     * or rejected with an error message, for example, if there is no
     * {@link https://forge.autodesk.com/en/docs/viewer/v6/reference/javascript/model|Model}.
     *
     * @example <caption>Using async/await</caption>
     * viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, async function() {
     *   const ids = await utils.listFragments();
     *   console.log('Fragment IDs', ids);
     * });
     */
    listFragments(parentId = undefined) {
        const viewer = this.viewer;
        return new Promise(function(resolve, reject) {
            function onSuccess(tree) {
                if (typeof parentId === 'undefined') {
                    parentId = tree.getRootId();
                }
                let ids = [];
                tree.enumNodeFragments(parentId, function(id) { ids.push(id); }, true);
                resolve(ids);
            }
            function onError(err) { reject(err); }
            viewer.getObjectTree(onSuccess, onError);
        });
    }

    /**
     * Gets world bounding box of scene fragment.
     * @param {number} fragId Fragment ID.
     * @returns {THREE.Box3} Transformation {@link https://threejs.org/docs/#api/en/math/Box3|Box3}.
     * @throws Exception when the fragments are not yet available.
     *
     * @example
     * viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, function() {
     *   try {
     *     const bounds = utils.getFragmentBounds(1);
     *     console.log('Fragment bounds', bounds);
     *   } catch(err) {
     *     console.error('Could not retrieve fragment bounds', err);
     *   }
     * });
     */
    getFragmentBounds(fragId) {
        if (!this.viewer.model) {
            throw new Error('Fragments not yet available. Wait for Autodesk.Viewing.FRAGMENTS_LOADED_EVENT event.');
        }
        const frags = this.viewer.model.getFragmentList();
        let bounds = new THREE.Box3();
        frags.getWorldBounds(fragId, bounds);
        return bounds;
    }

    /**
     * Gets _original_ transformation matrix of scene fragment, i.e.,
     * the transformation that was loaded from the Forge model.
     *
     * @param {number} fragId Fragment ID.
     * @returns {THREE.Matrix4} Transformation {@link https://threejs.org/docs/#api/en/math/Matrix4|Matrix4}.
     * @throws Exception when the fragments are not yet available.
     *
     * @example
     * const fragId = 123;
     * viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, function() {
     *     const transform = utils.getFragmentOrigTransform(fragId);
     *     console.log('Original fragment transform', transform);
     * });
     */
    getFragmentOrigTransform(fragId) {
        if (!this.viewer.model) {
            throw new Error('Fragments not yet available. Wait for Autodesk.Viewing.FRAGMENTS_LOADED_EVENT event.');
        }
        const frags = this.viewer.model.getFragmentList();
        let transform = new THREE.Matrix4();
        frags.getOriginalWorldMatrix(fragId, transform);
        return transform;
    }

    /**
     * Gets _auxiliary_ transform of a scene fragment.
     *
     * Note: auxiliary transforms are applied "on top" of the original
     * transforms, and are used by different features of the viewer,
     * for example, by animations or the explode tool.
     *
     * @param {number} fragId Fragment ID.
     * @param {THREE.Vector3} scale Vector to be populated with scale values.
     * @param {THREE.Quaternion} rotation Quaternion to be populated with rotation values.
     * @param {THREE.Vector3} position Vector to be populated with offset values.
     * @throws Exception if the fragments are not yet available.
     *
     * @example
     * const fragId = 123;
     * let scale = new THREE.Vector3(1, 1, 1);
     * let rotation = new THREE.Quaternion(0, 0, 0, 1);
     * let position = new THREE.Vector3(0, 0, 0);
     * viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, function() {
     *   utils.getFragmentAuxTransform(fragId, scale, rotation, position);
     *   console.log('Scale', scale);
     *   console.log('Rotation', rotation);
     *   console.log('Position', position);
     * });
     */
    getFragmentAuxTransform(fragId, scale, rotation, position) {
        if (!this.viewer.model) {
            throw new Error('Fragments not yet available. Wait for Autodesk.Viewing.FRAGMENTS_LOADED_EVENT event.');
        }
        const frags = this.viewer.model.getFragmentList();
        frags.getAnimTransform(fragId, scale, rotation, position);
    }

    /**
     * Sets _auxiliary_ transform of a scene fragment.
     *
     * Note: auxiliary transforms are applied "on top" of the original
     * transforms, and are used by different features of the viewer,
     * for example, by animations or the explode tool.
     *
     * @param {number} fragId Fragment ID.
     * @param {THREE.Vector3} [scale] Vector with new scale values.
     * @param {THREE.Quaternion} [rotation] Quaternion with new rotation values.
     * @param {THREE.Vector3} [position] Vector with new offset values.
     * @throws Exception if the fragments are not yet available.
     *
     * @example
     * const fragId = 123;
     * const scale = new THREE.Vector3(2.0, 3.0, 4.0);
     * const position = new THREE.Vector3(5.0, 6.0, 7.0);
     * viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, function() {
     *   utils.setFragmentAuxTransform(fragId, scale, null, position);
     * });
     */
    setFragmentAuxTransform(fragId, scale, rotation, position) {
        if (!this.viewer.model) {
            throw new Error('Fragments not yet available. Wait for Autodesk.Viewing.FRAGMENTS_LOADED_EVENT event.');
        }
        const frags = this.viewer.model.getFragmentList();
        frags.updateAnimTransform(fragId, scale, rotation, position);
    }

    /**
     * Gets _final_ transformation matrix of scene fragment, i.e.,
     * the transformation obtained by combining the _original_ and
     * the _auxiliar_ transforms.
     *
     * @param {number} fragId Fragment ID.
     * @returns {THREE.Matrix4} Transformation {@link https://threejs.org/docs/#api/en/math/Matrix4|Matrix4}.
     * @throws Exception when the fragments are not yet available.
     *
     * @example
     * viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, function() {
     *   try {
     *     const transform = utils.getFragmentTransform(1);
     *     console.log('Final fragment transform', transform);
     *   } catch(err) {
     *     console.error('Could not retrieve fragment transform', err);
     *   }
     * });
     */
    getFragmentTransform(fragId) {
        if (!this.viewer.model) {
            throw new Error('Fragments not yet available. Wait for Autodesk.Viewing.FRAGMENTS_LOADED_EVENT event.');
        }
        const frags = this.viewer.model.getFragmentList();
        let transform = new THREE.Matrix4();
        frags.getWorldMatrix(fragId, transform);
        return transform;
    }

    /**
     * Re-renders entire scene, including overlay scenes. Should only be called
     * when absolutely needed, for example after updating aux. transforms
     * of multiple fragments using {@link setFragmentAuxiliaryTransform}.
     */
    refresh() {
        this.impl.invalidate(true, true, true);
    }
}

Autodesk = Autodesk || {};
Autodesk.Viewing = Autodesk.Viewing || {};
Autodesk.Viewing.Utilities = Utilities;
