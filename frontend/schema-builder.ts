// Schema Builder TypeScript Application
import { apiCall, ApiResponse } from './services/api.js';
import { ENDPOINTS } from './services/endpoints.js';
import { Container } from './models/types.js'; // Ensure Container is exported there.
import { showToast } from './utils/toast.js'; // If used. I saw showToast calls.

// Types
interface SchemaField {
    name: string;
    type: string;
    required: boolean;
    array_item_type?: string;
    properties?: SchemaField[];
}

type SchemaDefinition = {
    $schema: string;
    type: string;
    properties: Record<string, any>;
    required: string[];
};

interface Schema {
    id?: number;
    name: string;
    schema_definition: SchemaDefinition;
    example?: any;
    user_id?: number;
    created_at?: string;
    updated_at?: string;
}

// Global state
let schemas: Schema[] = [];
let currentSchema: Schema | null = null;
let fieldModal: HTMLDivElement;
let fieldForm: HTMLFormElement;
let fieldModalTitle: HTMLHeadingElement;
let cancelFieldBtn: HTMLButtonElement;
let createTableModal: HTMLDivElement;
let createTableForm: HTMLFormElement;
let cancelCreateTableBtn: HTMLButtonElement;
let containerSelect: HTMLSelectElement;
let importModal: HTMLDivElement;
let importForm: HTMLFormElement;
let cancelImportBtn: HTMLButtonElement;

// Field types that support subfields (object/array)
const COMPLEX_TYPES = ['object', 'array'];

// DOM elements
document.addEventListener('DOMContentLoaded', () => {
    fieldModal = document.getElementById('field-modal') as HTMLDivElement;
    fieldForm = document.getElementById('field-form') as HTMLFormElement;
    fieldModalTitle = document.getElementById('field-modal-title') as HTMLHeadingElement;
    cancelFieldBtn = document.getElementById('cancel-field-btn') as HTMLButtonElement;
    
    createTableModal = document.getElementById('create-table-modal') as HTMLDivElement;
    createTableForm = document.getElementById('create-table-form') as HTMLFormElement;
    cancelCreateTableBtn = document.getElementById('cancel-create-table-btn') as HTMLButtonElement;
    containerSelect = document.getElementById('container-select') as HTMLSelectElement;

    importModal = document.getElementById('import-schema-modal') as HTMLDivElement;
    importForm = document.getElementById('import-schema-form') as HTMLFormElement;
    cancelImportBtn = document.getElementById('cancel-import-btn') as HTMLButtonElement;

    // Initialize
    fetchSchemas();
    setupEventListeners();
});

function toggleGitlabWebhookOptions(): void {
    const checkbox = document.getElementById('create-gitlab-webhook') as HTMLInputElement;
    const group = document.getElementById('gitlab-webhook-group') as HTMLDivElement;
    
    if (checkbox && group) {
        if (checkbox.checked) {
            group.style.display = 'block';
        } else {
            group.style.display = 'none';
        }
    }
}

function updateSchemaListSelection(): void {
    const items = document.querySelectorAll('.schema-item');
    items.forEach(item => {
        item.classList.remove('selected');
        if (item instanceof HTMLElement && currentSchema && currentSchema.id && item.dataset.id === currentSchema.id.toString()) {
            item.classList.add('selected');
        }
    });
}

function setupEventListeners(): void {
    const createSchemaBtn = document.getElementById('create-schema-btn') as HTMLButtonElement;
    const saveSchemaBtn = document.getElementById('save-schema-btn') as HTMLButtonElement;
    const downloadSchemaBtn = document.getElementById('download-schema-btn') as HTMLButtonElement;
    const deleteSchemaBtn = document.getElementById('delete-schema-btn') as HTMLButtonElement;
    const addFieldBtn = document.getElementById('add-field-btn') as HTMLButtonElement;
    const fieldModalClose = document.querySelector('#field-modal .close') as HTMLSpanElement;
    const createTableBtn = document.getElementById('create-table-btn') as HTMLButtonElement;
    const createTableModalClose = document.querySelector('#create-table-modal .close-create-table') as HTMLSpanElement;
    const importSchemaBtn = document.getElementById('import-schema-btn') as HTMLButtonElement;
    const importModalClose = document.querySelector('#import-schema-modal .close-import-schema') as HTMLSpanElement;
    const fieldTypeSelect = document.getElementById('field-type') as HTMLSelectElement;
    
    createSchemaBtn.addEventListener('click', createNewSchema);
    importSchemaBtn.addEventListener('click', showImportModal);
    saveSchemaBtn.addEventListener('click', saveCurrentSchema);
    downloadSchemaBtn.addEventListener('click', downloadCurrentSchema);
    deleteSchemaBtn.addEventListener('click', deleteCurrentSchema);
    addFieldBtn.addEventListener('click', () => showFieldModal());
    cancelFieldBtn.addEventListener('click', closeFieldModal);
    fieldModalClose.addEventListener('click', closeFieldModal);
    
    createTableBtn.addEventListener('click', showCreateTableModal);
    cancelCreateTableBtn.addEventListener('click', closeCreateTableModal);
    createTableModalClose.addEventListener('click', closeCreateTableModal);
    createTableForm.addEventListener('submit', handleCreateTableSubmit);

    importModalClose.addEventListener('click', closeImportModal);
    cancelImportBtn.addEventListener('click', closeImportModal);
    importForm.addEventListener('submit', handleImportSubmit);

    // Radio button logic for base selection
    const baseOptionRadios = document.querySelectorAll('input[name="base-option"]');
    baseOptionRadios.forEach(radio => {
        radio.addEventListener('change', toggleBaseOptions);
    });

    // Checkbox logic for gitlab webhook
    const createGitlabWebhookCheckbox = document.getElementById('create-gitlab-webhook') as HTMLInputElement;
    if(createGitlabWebhookCheckbox) {
        createGitlabWebhookCheckbox.addEventListener('change', toggleGitlabWebhookOptions);
    }

    // Radio button logic for import method
    const importMethodRadios = document.querySelectorAll('input[name="import-method"]');
    importMethodRadios.forEach(radio => {
        radio.addEventListener('change', toggleImportMethod);
    });

    fieldForm.addEventListener('submit', handleFieldSubmit);
    
    fieldTypeSelect.addEventListener('change', handleFieldTypeChange);
    window.addEventListener('click', (event) => {
        if (event.target === fieldModal) {
            closeFieldModal();
        }
        if (event.target === createTableModal) {
            closeCreateTableModal();
        }
        if (event.target === importModal) {
            closeImportModal();
        }
    });
}

// Removed duplications of getAuthToken and apiCall as they are imported
// from services/auth.js and services/api.js

async function fetchSchemas(): Promise<void> {
    const response = await apiCall<Schema[]>(ENDPOINTS.SCHEMAS.LIST);
    
    if (response.error) {
        showToast(response.error, 'error');
    } else if (response && Array.isArray(response)) {
        schemas = response;
        renderSchemasList();
    }
}

function renderSchemasList(): void {
    const schemasList = document.getElementById('schemas-list') as HTMLDivElement;
    
    if (schemas.length === 0) {
        schemasList.innerHTML = '<p class="empty-message">No schemas found. Create your first schema!</p>';
        return;
    }
    
    schemasList.innerHTML = '';
    
    schemas.forEach(schema => {
        const schemaItem = document.createElement('div');
        schemaItem.className = 'schema-item';
        if (currentSchema && currentSchema.id === schema.id) {
            schemaItem.classList.add('selected');
        }
        schemaItem.dataset.id = schema.id ? schema.id.toString() : '';
        schemaItem.style.cursor = 'pointer';
        schemaItem.addEventListener('click', () => loadSchema(schema));
        
        const name = document.createElement('h3');
        name.textContent = schema.name;
        
        const meta = document.createElement('span');
        meta.className = 'schema-meta';
        meta.textContent = `${Object.keys(schema.schema_definition.properties).length} fields`;
        
        schemaItem.appendChild(name);
        schemaItem.appendChild(meta);
        
        schemasList.appendChild(schemaItem);
    });
}

function createNewSchema(): void {
    currentSchema = {
        name: '',
        schema_definition: {
            $schema: 'http://json-schema.org/schema#',
            type: 'object',
            properties: {},
            required: []
        }
    };
    
    updateSchemaEditor();
    updateSchemaListSelection();
}

function loadSchema(schema: Schema): void {
    currentSchema = JSON.parse(JSON.stringify(schema)); // Deep copy
    updateSchemaEditor();
    updateSchemaListSelection();
}

function updateSchemaEditor(): void {
    const schemaTitle = document.getElementById('schema-title') as HTMLHeadingElement;
    const schemaNameInput = document.getElementById('schema-name') as HTMLInputElement;
    const schemaForm = document.getElementById('schema-form') as HTMLDivElement;
    const fieldsContainer = document.getElementById('fields-container') as HTMLDivElement;
    const emptyState = document.getElementById('empty-state') as HTMLDivElement;
    const saveSchemaBtn = document.getElementById('save-schema-btn') as HTMLButtonElement;
    const downloadSchemaBtn = document.getElementById('download-schema-btn') as HTMLButtonElement;
    const deleteSchemaBtn = document.getElementById('delete-schema-btn') as HTMLButtonElement;
    const createTableBtn = document.getElementById('create-table-btn') as HTMLButtonElement;
    
    if (!currentSchema) {
        schemaTitle.textContent = 'Select a Schema';
        schemaForm.style.display = 'none';
        fieldsContainer.style.display = 'none';
        emptyState.style.display = 'block';
        saveSchemaBtn.disabled = true;
        downloadSchemaBtn.disabled = true;
        deleteSchemaBtn.disabled = true;
        createTableBtn.disabled = true;
        return;
    }
    
    schemaTitle.textContent = currentSchema.id ? `Edit: ${currentSchema.name}` : 'New Schema';
    schemaNameInput.value = currentSchema.name;
    schemaForm.style.display = 'block';
    fieldsContainer.style.display = 'block';
    emptyState.style.display = 'none';
    
    saveSchemaBtn.disabled = false;
    downloadSchemaBtn.disabled = !!!currentSchema.id;
    deleteSchemaBtn.disabled = !!!currentSchema.id;
    createTableBtn.disabled = !!!currentSchema.id;
    
    renderFields();
    updateJsonPreview();
}

function renderFields(path: string = ''): void {
    const fieldsList = document.getElementById('fields-list') as HTMLDivElement;
    fieldsList.innerHTML = '';
    
    if (!currentSchema) return;
    
    const properties = getPropertiesAtPath(path);
    
    if (!properties || Object.keys(properties).length === 0) {
        fieldsList.innerHTML = '<p class="empty-message">No fields added yet. Click "Add Field" to get started.</p>';
        return;
    }
    
    Object.entries(properties).forEach(([fieldKey, fieldDef]) => {
        const fieldItem = document.createElement('div');
        fieldItem.className = 'field-item';
        fieldItem.dataset.path = path ? `${path}.${fieldKey}` : fieldKey;
        
        const fieldInfo = document.createElement('div');
        fieldInfo.className = 'field-info';
        
        const fieldName = document.createElement('div');
        fieldName.className = 'field-name';
        fieldName.textContent = fieldKey;
        
        const fieldType = document.createElement('div');
        fieldType.className = 'field-type';
        fieldType.textContent = getFieldDisplayType(fieldDef);
        
        const fieldRequired = document.createElement('div');
        fieldRequired.className = 'field-required';
        const requiredFields = currentSchema!.schema_definition.required;
        const required = isFieldRequired(fieldKey, path, requiredFields);
        fieldRequired.textContent = required ? 'Required' : 'Optional';
        fieldRequired.className = `field-required ${required ? 'required' : 'optional'}`;
        
        fieldInfo.appendChild(fieldName);
        fieldInfo.appendChild(fieldType);
        fieldInfo.appendChild(fieldRequired);
        
        const fieldActions = document.createElement('div');
        fieldActions.className = 'field-actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn small-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => showFieldModal(fieldKey, path, fieldDef));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn small-btn delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteField(fieldKey, path));
        
        fieldActions.appendChild(editBtn);
        fieldActions.appendChild(deleteBtn);
        
        fieldItem.appendChild(fieldInfo);
        fieldItem.appendChild(fieldActions);
        fieldsList.appendChild(fieldItem);
        
        // If it's an object type, render nested fields and add subfield button
        const def = fieldDef as any;
        if (def.type === 'object') {
            const nestedContainer = document.createElement('div');
            nestedContainer.className = 'nested-fields';
            
            const nestedHeader = document.createElement('div');
            nestedHeader.className = 'nested-header';
            nestedHeader.textContent = `${fieldKey} properties:`;
            
            const addSubfieldBtn = document.createElement('button');
            addSubfieldBtn.className = 'action-btn small-btn add-subfield-btn';
            addSubfieldBtn.textContent = '+ Add Subfield';
            const parentPath = path ? `${path}.${fieldKey}` : fieldKey;
            addSubfieldBtn.addEventListener('click', () => showFieldModal('', parentPath));
            
            const nestedList = document.createElement('div');
            nestedList.className = 'nested-list';
            nestedList.dataset.parent = parentPath;
            
            if (def.properties) {
                renderNestedFields(def.properties, parentPath, nestedList);
            }
            
            nestedContainer.appendChild(nestedHeader);
            nestedContainer.appendChild(addSubfieldBtn);
            nestedContainer.appendChild(nestedList);
            fieldsList.appendChild(nestedContainer);
        }
    });
}

function renderNestedFields(properties: any, parentPath: string, container: HTMLDivElement): void {
    Object.entries(properties).forEach(([fieldKey, fieldDef]) => {
        const fieldItem = document.createElement('div');
        fieldItem.className = 'field-item nested-item';
        fieldItem.dataset.path = `${parentPath}.${fieldKey}`;
        
        const fieldInfo = document.createElement('div');
        fieldInfo.className = 'field-info';
        
        const fieldName = document.createElement('div');
        fieldName.className = 'field-name';
        fieldName.textContent = fieldKey;
        
        const fieldType = document.createElement('div');
        fieldType.className = 'field-type';
        fieldType.textContent = getFieldDisplayType(fieldDef);
        
        fieldInfo.appendChild(fieldName);
        fieldInfo.appendChild(fieldType);
        
        const fieldActions = document.createElement('div');
        fieldActions.className = 'field-actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn small-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => showFieldModal(fieldKey, parentPath, fieldDef));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn small-btn delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteField(fieldKey, parentPath));
        
        fieldActions.appendChild(editBtn);
        fieldActions.appendChild(deleteBtn);
        
        fieldItem.appendChild(fieldInfo);
        fieldItem.appendChild(fieldActions);
        container.appendChild(fieldItem);
    });
}

function getPropertiesAtPath(path: string): any {
    if (!path) return currentSchema?.schema_definition.properties;
    
    const parts = path.split('.');
    let current: any = currentSchema?.schema_definition.properties;
    
    for (const part of parts) {
        if (current && current[part] && current[part].properties) {
            current = current[part].properties;
        } else {
            return {};
        }
    }
    
    return current;
}

function getFieldDisplayType(fieldDef: any): string {
    if (fieldDef.type === 'array' && fieldDef.items) {
        return `Array[${fieldDef.items.type}]`;
    }
    
    if (fieldDef.type === 'string' && fieldDef.subtype) {
        return `String (${fieldDef.subtype})`;
    }
    
    return fieldDef.type || 'unknown';
}

function isFieldRequired(fieldName: string, path: string, requiredFields: string[]): boolean {
    if (!path) {
        return requiredFields.includes(fieldName);
    }
    return requiredFields.includes(`${path}.${fieldName}`);
}

function showFieldModal(fieldName: string = '', path: string = '', existingDef: any = null): void {
    const fieldIdInput = document.getElementById('field-id') as HTMLInputElement;
    const parentPathInput = document.getElementById('parent-path') as HTMLInputElement;
    const fieldNameInput = document.getElementById('field-name') as HTMLInputElement;
    const fieldTypeSelect = document.getElementById('field-type') as HTMLSelectElement;
    const fieldRequiredCheckbox = document.getElementById('field-required') as HTMLInputElement;
    const arrayItemTypeGroup = document.getElementById('array-item-type-group') as HTMLDivElement;
    const arrayItemTypeSelect = document.getElementById('array-item-type') as HTMLSelectElement;
    const stringSubtypeGroup = document.getElementById('string-subtype-group') as HTMLDivElement;
    const stringSubtypeSelect = document.getElementById('string-subtype') as HTMLSelectElement;
    
    fieldIdInput.value = fieldName;
    parentPathInput.value = path;
    
    if (existingDef) {
        fieldModalTitle.textContent = 'Edit Field';
        fieldNameInput.value = fieldName;
        
        // Handle the case where existing field might have been datetime/duration/url as types
        const fieldType = existingDef.type || 'string';
        
        // Convert deprecated types to string with subtype
        if (fieldType === 'datetime' || fieldType === 'duration' || fieldType === 'url') {
            fieldTypeSelect.value = 'string';
            stringSubtypeSelect.value = fieldType.charAt(0).toUpperCase() + fieldType.slice(1);
            stringSubtypeGroup.style.display = 'block';
        } else {
            fieldTypeSelect.value = fieldType;
            stringSubtypeSelect.value = existingDef.subtype || '';
            stringSubtypeGroup.style.display = fieldType === 'string' ? 'block' : 'none';
        }
        
        fieldRequiredCheckbox.checked = currentSchema!.schema_definition.required.includes(
            path ? `${path}.${fieldName}` : fieldName
        );
        
        if (existingDef.type === 'array' && existingDef.items) {
            arrayItemTypeGroup.style.display = 'block';
            arrayItemTypeSelect.value = existingDef.items.type || 'string';
        } else {
            arrayItemTypeGroup.style.display = 'none';
        }
    } else {
        fieldModalTitle.textContent = 'Add Field';
        fieldNameInput.value = '';
        fieldTypeSelect.value = 'string';
        stringSubtypeSelect.value = '';
        stringSubtypeGroup.style.display = 'block';
        fieldRequiredCheckbox.checked = false;
        arrayItemTypeGroup.style.display = 'none';
    }
    
    fieldModal.style.display = 'block';
}

function closeFieldModal(): void {
    fieldModal.style.display = 'none';
    fieldForm.reset();
}

function handleFieldTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const arrayItemTypeGroup = document.getElementById('array-item-type-group') as HTMLDivElement;
    const stringSubtypeGroup = document.getElementById('string-subtype-group') as HTMLDivElement;
    
    if (target.value === 'array') {
        arrayItemTypeGroup.style.display = 'block';
        stringSubtypeGroup.style.display = 'none';
    } else if (target.value === 'string') {
        arrayItemTypeGroup.style.display = 'none';
        stringSubtypeGroup.style.display = 'block';
    } else {
        arrayItemTypeGroup.style.display = 'none';
        stringSubtypeGroup.style.display = 'none';
    }
}

async function handleFieldSubmit(event: Event): Promise<void> {
    event.preventDefault();
    
    if (!currentSchema) return;
    
    const fieldIdInput = document.getElementById('field-id') as HTMLInputElement;
    const parentPathInput = document.getElementById('parent-path') as HTMLInputElement;
    const fieldNameInput = document.getElementById('field-name') as HTMLInputElement;
    const fieldTypeSelect = document.getElementById('field-type') as HTMLSelectElement;
    const fieldRequiredCheckbox = document.getElementById('field-required') as HTMLInputElement;
    const arrayItemTypeSelect = document.getElementById('array-item-type') as HTMLSelectElement;
    const stringSubtypeSelect = document.getElementById('string-subtype') as HTMLSelectElement;
    
    const fieldName = fieldNameInput.value.trim();
    const fieldType = fieldTypeSelect.value;
    const isRequired = fieldRequiredCheckbox.checked;
    const parentPath = parentPathInput.value;
    const existingFieldId = fieldIdInput.value;
    
    if (!fieldName) {
        showToast('Field name is required', 'error');
        return;
    }
    
    // Validate field name
    if (!/^[a-zA-Z_][a-zA-Z0-9_\s]*$/.test(fieldName)) {
        showToast('Field name must start with a letter or underscore and contain only letters, numbers, spaces, and underscores', 'error');
        return;
    }
    
    const properties = getPropertiesAtPath(parentPath);
    
    // Check if field name already exists (unless editing)
    if (existingFieldId !== fieldName && properties && properties[fieldName]) {
        showToast('Field name already exists', 'error');
        return;
    }
    
    // Build field definition
    const fieldDef: any = {
        type: fieldType
    };
    
    if (fieldType === 'string') {
        const subtype = stringSubtypeSelect.value;
        if (subtype) {
            fieldDef.subtype = subtype;
        }
    } else if (fieldType === 'array') {
        fieldDef.items = {
            type: arrayItemTypeSelect.value
        };
    } else if (fieldType === 'object') {
        fieldDef.properties = {};
        fieldDef.required = [];
    }
    
    // Add or update field
    if (existingFieldId && properties && properties[existingFieldId]) {
        // Update existing field
        delete properties[existingFieldId];
        
        // Update required fields list
        const oldKeyPath = parentPath ? `${parentPath}.${existingFieldId}` : existingFieldId;
        const newKeyPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
        
        const reqIndex = currentSchema.schema_definition.required.indexOf(oldKeyPath);
        if (reqIndex > -1) {
            currentSchema.schema_definition.required.splice(reqIndex, 1);
        }
        if (isRequired) {
            currentSchema.schema_definition.required.push(newKeyPath);
        }
    } else if (isRequired) {
        const keyPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
        currentSchema.schema_definition.required.push(keyPath);
    }
    
    properties[fieldName] = fieldDef;
    
    closeFieldModal();
    renderFields();
    updateJsonPreview();
    
    // Auto-save to server
    await saveCurrentSchema();
}

async function deleteField(fieldName: string, path: string = ''): Promise<void> {
    if (!confirm('Are you sure you want to delete this field?')) return;
    
    if (!currentSchema) return;
    
    const properties = getPropertiesAtPath(path);
    
    if (properties && properties[fieldName]) {
        delete properties[fieldName];
        
        // Remove from required fields
        const keyPath = path ? `${path}.${fieldName}` : fieldName;
        const reqIndex = currentSchema.schema_definition.required.indexOf(keyPath);
        if (reqIndex > -1) {
            currentSchema.schema_definition.required.splice(reqIndex, 1);
        }
        
        renderFields();
        updateJsonPreview();
        
        // Auto-save to server
        await saveCurrentSchema();
    }
}

async function saveCurrentSchema(): Promise<void> {
    if (!currentSchema) return;
    
    const schemaNameInput = document.getElementById('schema-name') as HTMLInputElement;
    currentSchema.name = schemaNameInput.value.trim();
    
    if (!currentSchema.name) {
        showToast('Schema name is required', 'error');
        return;
    }
    
    const saveSchemaBtn = document.getElementById('save-schema-btn') as HTMLButtonElement;
    saveSchemaBtn.disabled = true;
    saveSchemaBtn.textContent = 'Saving...';
    
    try {
        let response: ApiResponse<Schema>;
        
        if (currentSchema.id) {
            response = await apiCall(`/api/schemas/${currentSchema.id}`, 'PUT', {
                name: currentSchema.name,
                schema_definition: currentSchema.schema_definition
            });
        } else {
            response = await apiCall('/api/schemas', 'POST', {
                name: currentSchema.name,
                schema_definition: currentSchema.schema_definition
            });
        }
        
        if (response.error) {
            showToast(response.error, 'error');
        } else {
            const savedSchema = response as Schema;
            currentSchema.id = savedSchema.id;
            currentSchema.name = savedSchema.name;
            currentSchema.schema_definition = savedSchema.schema_definition;
            currentSchema.example = savedSchema.example;
            currentSchema.updated_at = savedSchema.updated_at;
            
            showToast('Schema saved successfully', 'success');
            await fetchSchemas();
            updateSchemaEditor();
        }
    } catch (error) {
        showToast('An unexpected error occurred', 'error');
        console.error('Save error:', error);
    } finally {
        saveSchemaBtn.disabled = false;
        saveSchemaBtn.textContent = 'Save';
    }
}

async function deleteCurrentSchema(): Promise<void> {
    if (!currentSchema || !currentSchema.id) return;
    
    if (!confirm(`Are you sure you want to delete the schema "${currentSchema.name}"?`)) return;
    
    const deleteSchemaBtn = document.getElementById('delete-schema-btn') as HTMLButtonElement;
    deleteSchemaBtn.disabled = true;
    deleteSchemaBtn.textContent = 'Deleting...';
    
    try {
        const response = await apiCall(`/api/schemas/${currentSchema.id}`, 'DELETE');
        
        if (response.error) {
            showToast(response.error, 'error');
        } else {
            showToast('Schema deleted successfully', 'success');
            currentSchema = null;
            await fetchSchemas();
            updateSchemaEditor();
        }
    } catch (error) {
        showToast('An unexpected error occurred', 'error');
        console.error('Delete error:', error);
    } finally {
        deleteSchemaBtn.disabled = false;
        deleteSchemaBtn.textContent = 'Delete';
    }
}

async function downloadCurrentSchema(): Promise<void> {
    if (!currentSchema || !currentSchema.id) return;
    
    try {
        const response = await apiCall<{filename: string, schema: any}>(
            `/api/schemas/${currentSchema.id}/download`
        );
        
        if (response.error) {
            showToast(response.error, 'error');
        } else {
            const data = response as {filename: string, schema: any};
            
            // Create and download the file
            const blob = new Blob([JSON.stringify(data.schema, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast('Schema downloaded successfully', 'success');
        }
    } catch (error) {
        showToast('An unexpected error occurred', 'error');
        console.error('Download error:', error);
    }
}

function showCreateTableModal(): void {
    if (!currentSchema) return;
    
    // Set default table name
    const tableNameInput = document.getElementById('table-name') as HTMLInputElement;
    tableNameInput.value = currentSchema.name;
    
    // Reset form
    const baseIdInput = document.getElementById('base-id') as HTMLInputElement;
    const newBaseNameInput = document.getElementById('new-base-name') as HTMLInputElement;
    baseIdInput.value = '';
    newBaseNameInput.value = '';
    
    // Default to existing base
    const existingBaseRadio = document.querySelector('input[name="base-option"][value="existing"]') as HTMLInputElement;
    existingBaseRadio.checked = true;
    toggleBaseOptions();
    toggleGitlabWebhookOptions();
    
    // Populate containers
    fetchContainers();
    
    createTableModal.style.display = 'block';
}

function closeCreateTableModal(): void {
    createTableModal.style.display = 'none';
}

function toggleBaseOptions(): void {
    const existingGroup = document.getElementById('existing-base-group') as HTMLDivElement;
    const newBaseGroup = document.getElementById('new-base-group') as HTMLDivElement;
    const existingBaseRadio = document.querySelector('input[name="base-option"][value="existing"]') as HTMLInputElement;
    
    if (existingBaseRadio.checked) {
        existingGroup.style.display = 'block';
        newBaseGroup.style.display = 'none';
    } else {
        existingGroup.style.display = 'none';
        newBaseGroup.style.display = 'block';
    }
}

async function fetchContainers(): Promise<void> {
    try {
        const response = await apiCall<Container[]>('/api/containers');
        if (response.error) {
            console.error('Failed to fetch containers:', response.error);
            return;
        }
        
        containerSelect.innerHTML = '<option value="">Select a container...</option>';
        
        // The API returns a list of objects directly or wrapped?
        // Let's assume response (which is ApiResponse<T>) IS the array T if no error, but ApiResponse<T> = T & { error?: string }
        // So if T is Container[], response is Container[] & { error?: string }
        
        const containers = response as unknown as Container[];
        
        if (Array.isArray(containers)) {
             containers.forEach((container) => {
                const option = document.createElement('option');
                option.value = container.id.toString();
                option.textContent = container.name;
                containerSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error fetching containers:', error);
    }
}

async function handleCreateTableSubmit(e: Event): Promise<void> {
    e.preventDefault();
    
    if (!currentSchema || !currentSchema.id) {
        alert('No schema selected');
        return;
    }
    
    const formData = new FormData(createTableForm);
    const containerId = formData.get('container_id');
    const baseOption = formData.get('base-option');
    const baseId = formData.get('base_id');
    const newBaseName = formData.get('new_base_name');
    const tableName = formData.get('table_name');
    
    // Gitlab Webhook
    const createGitlabWebhook = (document.getElementById('create-gitlab-webhook') as HTMLInputElement).checked;
    const gitlabRepoUrl = formData.get('gitlab_repo_url');
    const gitlabApiToken = formData.get('gitlab_api_token');
    const gitlabProjectToken = formData.get('gitlab_project_token');

    if (!containerId) {
        alert('Please select a container');
        return;
    }
    
    if (baseOption === 'existing' && !baseId) {
        alert('Please enter a Base ID');
        return;
    }
    
    if (baseOption === 'new' && !newBaseName) {
        alert('Please enter a New Base Name');
        return;
    }
    
    if (!tableName) {
        alert('Please enter a Table Name');
        return;
    }

    if (createGitlabWebhook) {
        if (!gitlabRepoUrl) {
            alert('Please enter GitLab Repo URL');
            return;
        }
        if (!gitlabApiToken) {
            alert('Please enter GitLab API Token');
            return;
        }
        if (!gitlabProjectToken) {
            alert('Please enter GitLab Project Token');
            return;
        }
    }
    
    const submitBtn = document.getElementById('confirm-create-table-btn') as HTMLButtonElement;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating...';
    submitBtn.disabled = true;
    
    try {
        const payload: any = {
            container_id: containerId,
            base_id: baseOption === 'existing' ? baseId : null,
            new_base_name: baseOption === 'new' ? newBaseName : null,
            table_name: tableName,
            schema_id: currentSchema.id
        };

        if (createGitlabWebhook) {
            payload.create_gitlab_webhook = true;
            payload.gitlab_repo_url = gitlabRepoUrl;
            payload.gitlab_api_token = gitlabApiToken;
            payload.gitlab_project_token = gitlabProjectToken;
        }

        const response = await apiCall('/api/schemas/create-table', 'POST', payload);
        
        if (response.error) {
            alert(`Error: ${response.error}`);
        } else {
            alert('Table created successfully!');
            closeCreateTableModal();
        }
    } catch (error) {
        console.error('Error creating table:', error);
        alert('An error occurred while creating the table');
    } finally {
        if (originalText) submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function updateJsonPreview(): void {
    const jsonPreview = document.getElementById('json-preview') as HTMLPreElement;
    const codeElement = jsonPreview.querySelector('code') as HTMLElement;
    
    const examplePreview = document.getElementById('example-preview') as HTMLPreElement;
    const exampleCodeElement = examplePreview ? examplePreview.querySelector('code') as HTMLElement : null;

    if (currentSchema) {
        codeElement.textContent = JSON.stringify(currentSchema.schema_definition, null, 2);
        if (exampleCodeElement) {
            exampleCodeElement.textContent = currentSchema.example ? JSON.stringify(currentSchema.example, null, 2) : '{}';
        }
    } else {
        codeElement.textContent = '{}';
        if (exampleCodeElement) {
            exampleCodeElement.textContent = '{}';
        }
    }
}

function showImportModal(): void {
    importForm.reset();
    toggleImportMethod(); // Set initial state
    importModal.style.display = 'block';
}

function closeImportModal(): void {
    importModal.style.display = 'none';
}

function toggleImportMethod(): void {
    const fileGroup = document.getElementById('import-file-group') as HTMLDivElement;
    const pasteGroup = document.getElementById('import-paste-group') as HTMLDivElement;
    const fileRadio = document.querySelector('input[name="import-method"][value="file"]') as HTMLInputElement;
    
    if (fileRadio.checked) {
        fileGroup.style.display = 'block';
        pasteGroup.style.display = 'none';
        const fileInput = document.getElementById('import-file') as HTMLInputElement;
        fileInput.required = true;
        const jsonInput = document.getElementById('import-json') as HTMLTextAreaElement;
        jsonInput.required = false;
    } else {
        fileGroup.style.display = 'none';
        pasteGroup.style.display = 'block';
        const fileInput = document.getElementById('import-file') as HTMLInputElement;
        fileInput.required = false;
        const jsonInput = document.getElementById('import-json') as HTMLTextAreaElement;
        jsonInput.required = true;
    }
}

async function handleImportSubmit(e: Event): Promise<void> {
    e.preventDefault();
    
    const formData = new FormData(importForm);
    const name = formData.get('name') as string;
    const importMethod = formData.get('import-method');
    
    if (!name) {
        showToast('Schema name is required', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('confirm-import-btn') as HTMLButtonElement;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Importing...';
    submitBtn.disabled = true;
    
    let schemaJsonStr = '';
    
    try {
        if (importMethod === 'file') {
            const fileInput = document.getElementById('import-file') as HTMLInputElement;
            if (fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                schemaJsonStr = await readFileAsText(file);
            } else {
                showToast('Please select a file', 'error');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                return;
            }
        } else {
            const jsonTextarea = document.getElementById('import-json') as HTMLTextAreaElement;
            schemaJsonStr = jsonTextarea.value.trim();
        }
        
        // Parse and Validate JSON
        let schemaDefinition: any;
        try {
            schemaDefinition = JSON.parse(schemaJsonStr);
        } catch (parseError) {
             showToast('Invalid JSON content', 'error');
             console.error(parseError);
             return;
        }
        
        // Basic schema validation
        if (!schemaDefinition || typeof schemaDefinition !== 'object') {
             showToast('JSON must be an object', 'error');
             return;
        }

        const response = await apiCall('/api/schemas', 'POST', {
            name: name,
            schema_definition: schemaDefinition
        });
        
        if (response.error) {
            showToast(response.error, 'error');
        } else {
            showToast('Schema imported successfully', 'success');
            closeImportModal();
            await fetchSchemas();
            // Automatically select the new schema (assuming it's the last one or searching by name)
            // Just reloading the list for now
        }
        
    } catch (error) {
        console.error('Import error:', error);
        showToast('An error occurred during import', 'error');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}