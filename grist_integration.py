"""
Integration script to send scraper output to Grist.

This script reads JSON/CSV files from scrapers and sends them to Grist tables.
It can be used as a wrapper around existing scrapers or called after scrapers run.
"""

import os
import sys
import json
import csv
import argparse
from pathlib import Path
from grist_client import GristClient, infer_columns_from_data


def load_json_data(file_path: str) -> list:
    """Load data from JSON file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        # Handle both list and dict formats
        if isinstance(data, dict):
            # If it's a dict, try to find a list value
            for key, value in data.items():
                if isinstance(value, list):
                    return value
            # If no list found, wrap the dict
            return [data]
        return data if isinstance(data, list) else [data]


def load_csv_data(file_path: str) -> list:
    """Load data from CSV file."""
    data = []
    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert empty strings to None for better type inference
            cleaned_row = {k: (v if v else None) for k, v in row.items()}
            data.append(cleaned_row)
    return data


def send_to_grist(
    data: list,
    api_key: str,
    server: str,
    doc_name: str,
    table_name: str,
    org: str = "brightstar",
    upsert: bool = False,
    key_columns: list = None
):
    """
    Send data to Grist table.
    
    Args:
        data: List of record dicts
        api_key: Grist API key
        server: Grist server URL
        doc_name: Document name
        table_name: Table name
        org: Organization name
        upsert: Whether to upsert (update existing) records
        key_columns: Columns to use for upsert matching
    """
    if not data:
        print("No data to send")
        return
    
    client = GristClient(api_key, server, org)
    
    # Get or create document
    print(f"Getting/creating document: {doc_name}")
    doc = client.get_or_create_document(doc_name)
    print(f"Document ID: {doc['id']}")
    
    # Infer columns from data
    print("Inferring column types from data...")
    columns = infer_columns_from_data(data)
    print(f"Detected {len(columns)} columns: {', '.join([c['id'] for c in columns])}")
    
    # Ensure table exists with correct schema
    print(f"Ensuring table '{table_name}' exists...")
    client.ensure_table(doc["id"], table_name, columns)
    
    # Add timestamp column if not present
    from datetime import datetime
    if "scraped_at" not in [c["id"] for c in columns]:
        client.ensure_table(doc["id"], table_name, [{"id": "scraped_at", "type": "DateTime"}])
    
    # Add timestamp to all records
    timestamp = datetime.now().isoformat()
    for record in data:
        if "scraped_at" not in record:
            record["scraped_at"] = timestamp
    
    # Send data
    print(f"Sending {len(data)} records to Grist...")
    if upsert:
        result = client.upsert_records(doc["id"], table_name, data, key_columns)
    else:
        result = client.add_records(doc["id"], table_name, data)
    
    print(f"✅ Successfully sent {len(data)} records to {doc_name}/{table_name}")
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Send scraper output to Grist tables"
    )
    parser.add_argument("input_file", help="Input JSON or CSV file")
    parser.add_argument("--api-key", required=True, help="Grist API key")
    parser.add_argument("--server", required=True, help="Grist server URL")
    parser.add_argument("--doc", default="ABS_Scraper_Data", help="Grist document name")
    parser.add_argument("--table", required=True, help="Grist table name")
    parser.add_argument("--org", default="brightstar", help="Grist organization name")
    parser.add_argument("--upsert", action="store_true", help="Upsert records (update existing)")
    parser.add_argument("--key-columns", nargs="+", help="Columns to use for upsert matching")
    
    args = parser.parse_args()
    
    # Load data
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)
    
    print(f"Loading data from {args.input_file}...")
    if input_path.suffix.lower() == '.json':
        data = load_json_data(str(input_path))
    elif input_path.suffix.lower() == '.csv':
        data = load_csv_data(str(input_path))
    else:
        print(f"Error: Unsupported file format: {input_path.suffix}")
        print("Supported formats: .json, .csv")
        sys.exit(1)
    
    print(f"Loaded {len(data)} records")
    
    # Send to Grist
    try:
        send_to_grist(
            data,
            args.api_key,
            args.server,
            args.doc,
            args.table,
            args.org,
            args.upsert,
            args.key_columns
        )
    except Exception as e:
        print(f"Error sending data to Grist: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

