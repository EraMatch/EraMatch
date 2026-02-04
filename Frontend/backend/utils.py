import csv
import os
import pandas as pd
from typing import List, Dict

# Get the directory where this file is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")

def read_csv(filename: str):
    file_path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(file_path):
        return []
    df = pd.read_csv(file_path)
    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")

def write_csv(filename: str, fieldnames: List[str], data: List[Dict]):
    file_path = os.path.join(DATA_DIR, filename)
    df = pd.DataFrame(data, columns=fieldnames)
    df.to_csv(file_path, index=False)
