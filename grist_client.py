"""
Grist API Client for sending scraped data to Grist tables.

This client handles:
- Creating documents if they don't exist
- Creating tables if they don't exist
- Adding records to tables
- Updating existing records
"""

import os
import requests
import json
from typing import List, Dict, Optional
from datetime import datetime


class GristClient:
    """Client for interacting with Grist API."""
    
    def __init__(self, api_key: str, server: str, org: str = "brightstar"):
        """
        Initialize Grist API client.
        
        Args:
            api_key: Grist API key
            server: Grist server URL (e.g., https://grist.pythonfinancial.com)
            org: Organization/workspace name (default: brightstar)
        """
        self.api_key = api_key
        self.server = server.rstrip('/')
        self.org = org
        self.base_url = f"{self.server}/api"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def _request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict:
        """Make an API request."""
        url = f"{self.base_url}{endpoint}"
        response = requests.request(method, url, headers=self.headers, json=data)
        response.raise_for_status()
        return response.json()
    
    def list_workspaces(self) -> List[Dict]:
        """List all workspaces."""
        return self._request("GET", "/workspaces")
    
    def get_workspace(self, workspace_id: Optional[str] = None) -> Dict:
        """
        Get workspace by ID or name.
        If workspace_id is None, uses the org name.
        """
        if workspace_id is None:
            workspace_id = self.org
        
        workspaces = self.list_workspaces()
        for ws in workspaces:
            if ws.get("id") == workspace_id or ws.get("name") == workspace_id:
                return ws
        
        raise ValueError(f"Workspace '{workspace_id}' not found")
    
    def list_documents(self, workspace_id: Optional[str] = None) -> List[Dict]:
        """List all documents in a workspace."""
        if workspace_id is None:
            workspace = self.get_workspace()
            workspace_id = workspace["id"]
        
        return self._request("GET", f"/workspaces/{workspace_id}/docs")
    
    def get_or_create_document(self, doc_name: str, workspace_id: Optional[str] = None) -> Dict:
        """
        Get existing document or create a new one.
        
        Args:
            doc_name: Name of the document
            workspace_id: Workspace ID (optional)
        
        Returns:
            Document dict with 'id' and 'name'
        """
        if workspace_id is None:
            workspace = self.get_workspace()
            workspace_id = workspace["id"]
        
        # Check if document exists
        docs = self.list_documents(workspace_id)
        for doc in docs:
            if doc.get("name") == doc_name:
                return doc
        
        # Create new document
        return self._request("POST", f"/workspaces/{workspace_id}/docs", {
            "name": doc_name
        })
    
    def list_tables(self, doc_id: str) -> List[str]:
        """List all tables in a document."""
        response = self._request("GET", f"/docs/{doc_id}/tables")
        return list(response.keys())
    
    def get_table_schema(self, doc_id: str, table_id: str) -> Dict:
        """Get table schema (columns)."""
        return self._request("GET", f"/docs/{doc_id}/tables/{table_id}/columns")
    
    def create_table(self, doc_id: str, table_id: str, columns: List[Dict]) -> Dict:
        """
        Create a new table with specified columns.
        
        Args:
            doc_id: Document ID
            table_id: Table ID (e.g., "MSM_Results")
            columns: List of column definitions
                    [{"id": "col1", "type": "Text"}, {"id": "col2", "type": "Numeric"}]
        """
        # First create the table structure
        columns_data = {}
        for col in columns:
            columns_data[col["id"]] = {"type": col.get("type", "Text")}
        
        return self._request("POST", f"/docs/{doc_id}/tables", {
            "tables": [{
                "id": table_id,
                "columns": columns_data
            }]
        })
    
    def ensure_table(self, doc_id: str, table_id: str, columns: List[Dict]) -> None:
        """
        Ensure a table exists with the specified columns.
        Creates it if it doesn't exist, adds missing columns if it does.
        """
        tables = self.list_tables(doc_id)
        
        if table_id not in tables:
            # Create new table
            self.create_table(doc_id, table_id, columns)
        else:
            # Check and add missing columns
            existing_schema = self.get_table_schema(doc_id, table_id)
            existing_cols = {col["id"] for col in existing_schema.get("columns", [])}
            
            new_cols = {}
            for col in columns:
                if col["id"] not in existing_cols:
                    new_cols[col["id"]] = {"type": col.get("type", "Text")}
            
            if new_cols:
                self._request("PATCH", f"/docs/{doc_id}/tables/{table_id}/columns", {
                    "columns": new_cols
                })
    
    def add_records(self, doc_id: str, table_id: str, records: List[Dict]) -> Dict:
        """
        Add records to a table.
        
        Args:
            doc_id: Document ID
            table_id: Table ID
            records: List of record dicts (column_name: value)
        
        Returns:
            Response with record IDs
        """
        return self._request("POST", f"/docs/{doc_id}/tables/{table_id}/records", {
            "records": records
        })
    
    def upsert_records(self, doc_id: str, table_id: str, records: List[Dict], 
                      key_columns: List[str] = None) -> Dict:
        """
        Upsert records (insert or update based on key columns).
        
        Args:
            doc_id: Document ID
            table_id: Table ID
            records: List of record dicts
            key_columns: Columns to use for matching (e.g., ["id", "date"])
        
        Returns:
            Response with record IDs
        """
        if key_columns is None:
            # If no key columns specified, just add records
            return self.add_records(doc_id, table_id, records)
        
        # For now, we'll just add records
        # TODO: Implement proper upsert logic if needed
        return self.add_records(doc_id, table_id, records)


def infer_columns_from_data(data: List[Dict]) -> List[Dict]:
    """
    Infer Grist column types from sample data.
    
    Args:
        data: List of record dicts
    
    Returns:
        List of column definitions
    """
    if not data:
        return []
    
    columns = []
    sample = data[0]
    
    for key, value in sample.items():
        col_type = "Text"  # default
        
        if isinstance(value, bool):
            col_type = "Bool"
        elif isinstance(value, int):
            col_type = "Int"
        elif isinstance(value, float):
            col_type = "Numeric"
        elif isinstance(value, datetime):
            col_type = "DateTime"
        elif isinstance(value, str):
            # Try to detect date strings
            try:
                datetime.fromisoformat(value.replace('Z', '+00:00'))
                col_type = "DateTime"
            except:
                col_type = "Text"
        
        columns.append({
            "id": key,
            "type": col_type
        })
    
    return columns


if __name__ == "__main__":
    # Example usage
    import sys
    
    if len(sys.argv) < 4:
        print("Usage: python grist_client.py <api_key> <server> <doc_name> <table_name>")
        print("Example: python grist_client.py YOUR_KEY https://grist.pythonfinancial.com ABS_Data MSM_Results")
        sys.exit(1)
    
    api_key = sys.argv[1]
    server = sys.argv[2]
    doc_name = sys.argv[3]
    table_name = sys.argv[4]
    
    client = GristClient(api_key, server)
    
    # Get or create document
    doc = client.get_or_create_document(doc_name)
    print(f"Document: {doc['name']} (ID: {doc['id']})")
    
    # Example data
    sample_data = [
        {"timestamp": datetime.now().isoformat(), "value": 123, "status": "active"},
        {"timestamp": datetime.now().isoformat(), "value": 456, "status": "inactive"}
    ]
    
    # Infer columns
    columns = infer_columns_from_data(sample_data)
    
    # Ensure table exists
    client.ensure_table(doc["id"], table_name, columns)
    print(f"Table '{table_name}' ready")
    
    # Add records
    result = client.add_records(doc["id"], table_name, sample_data)
    print(f"Added {len(sample_data)} records")

