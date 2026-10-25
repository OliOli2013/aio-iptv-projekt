#!/usr/bin/env python3
"""Verify actual private R2 object bytes against the audited inventory.

Run with read-only R2 S3 credentials in the environment. No public bucket,
Cloudflare API token, deployment changes, or write permission is needed.
"""
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
REQ=('AIO_R2_ENDPOINT','AIO_R2_ACCESS_KEY_ID','AIO_R2_SECRET_ACCESS_KEY')
missing=[v for v in REQ if not os.environ.get(v)]
if missing:
 print('ERROR: live R2 verification not performed; missing: '+', '.join(missing),file=sys.stderr)
 sys.exit(2)
try:
 import boto3
 from botocore.config import Config
except ImportError:
 print('ERROR: boto3 required. Install: python3 -m pip install boto3',file=sys.stderr)
 sys.exit(2)

manifest=json.loads((ROOT/'integrity/aio_private_r2_inventory.json').read_text('utf-8'))
assert manifest.get('bucket')=='aio-downloads-private', 'Unexpected R2 bucket'
client=boto3.client('s3',endpoint_url=os.environ['AIO_R2_ENDPOINT'],
  aws_access_key_id=os.environ['AIO_R2_ACCESS_KEY_ID'],
  aws_secret_access_key=os.environ['AIO_R2_SECRET_ACCESS_KEY'],
  region_name='auto',config=Config(signature_version='s3v4',retries={'max_attempts':2}))
errors=[]
for item in manifest['objects']:
 key=item['key']
 try:
  # GET is intentional: HEAD alone proves presence/size but not SHA-256.
  response=client.get_object(Bucket=manifest['bucket'],Key=key)
  content_length=response.get('ContentLength')
  if item.get('size_bytes') is not None and content_length!=item['size_bytes']:
   errors.append(key+': unexpected size '+str(content_length))
  h=hashlib.sha256();total=0
  try:
   for chunk in response['Body'].iter_chunks(chunk_size=1024*1024):
    if chunk:h.update(chunk);total+=len(chunk)
  finally:response['Body'].close()
  if content_length is not None and content_length!=total:
   errors.append(key+': incomplete download')
  if h.hexdigest()!=item['sha256']:
   errors.append(key+': SHA-256 mismatch')
  else:
   print('R2 SHA-256 OK:',key,'('+str(total)+' bytes)')
 except Exception as exc:
  # Don't print remote exception messages: SDK diagnostics may contain endpoint info.
  errors.append(key+': retrieval failed ('+type(exc).__name__+')')
for error in errors:print('ERROR:',error,file=sys.stderr)
if errors:sys.exit(1)
print('R2 live verification complete: all',len(manifest['objects']),'objects verified.')
