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
 from botocore.exceptions import ClientError
except ImportError:
 print('ERROR: boto3 required. Install: python3 -m pip install boto3',file=sys.stderr)
 sys.exit(2)

manifest=json.loads((ROOT/'integrity/aio_private_r2_inventory.json').read_text('utf-8'))
assert manifest.get('bucket')=='aio-downloads-private', 'Unexpected R2 bucket'
client=boto3.client('s3',endpoint_url=os.environ['AIO_R2_ENDPOINT'],
  aws_access_key_id=os.environ['AIO_R2_ACCESS_KEY_ID'],
  aws_secret_access_key=os.environ['AIO_R2_SECRET_ACCESS_KEY'],
  region_name='auto',config=Config(signature_version='s3v4',retries={'max_attempts':2},
  request_checksum_calculation='when_required',
  response_checksum_validation='when_required'))
# S3 diagnostic: validate endpoint syntax locally, then compare LIST and HEAD
# with GET. Never print endpoint URL, credentials, HTTP headers or remote messages.
import re
from urllib.parse import urlsplit

_endpoint=os.environ['AIO_R2_ENDPOINT']
try:
 _u=urlsplit(_endpoint)
 _host=_u.hostname or ''
 _shape_ok=(_u.scheme=='https' and _u.username is None and _u.password is None
            and _u.port is None and _u.path in ('','/') and not _u.query
            and not _u.fragment and bool(re.fullmatch(
               r'[0-9a-fA-F]{32}(?:\.(?:eu|us|fedramp|fedramp-high))?\.r2\.cloudflarestorage\.com',_host)))
except ValueError:
 _shape_ok=False
if not _shape_ok:
 print('ERROR: AIO_R2_ENDPOINT format invalid; use exact S3 API endpoint, without bucket or path.',file=sys.stderr)
 sys.exit(2)
for _name in REQ:
 if os.environ[_name]!=os.environ[_name].strip():
  print('ERROR: whitespace surrounding GitHub secret '+_name+'; verify copied value.',file=sys.stderr)
  sys.exit(2)
if len(os.environ['AIO_R2_ACCESS_KEY_ID'])!=32:
 print('WARNING: R2 Access Key ID unexpected length (expected 32); confirm S3 Access Key ID, not API token.',file=sys.stderr)
print('R2 CONFIG: endpoint format OK; secret whitespace OK.')

def _safe_error(exc):
 response=exc.response if isinstance(exc.response,dict) else {}
 err=response.get('Error') or {}
 raw=str(err.get('Code') or '') if isinstance(err,dict) else ''
 codes={'AccessDenied','SignatureDoesNotMatch','InvalidAccessKeyId',
        'NoSuchBucket','NoSuchKey','AuthorizationHeaderMalformed',
        'InvalidToken','ExpiredToken','RequestTimeTooSkewed',
        'InvalidRequest','InvalidArgument','PermanentRedirect'}
 code=raw if raw in codes else 'Unrecognized'
 meta=response.get('ResponseMetadata') or {}
 status=meta.get('HTTPStatusCode') if isinstance(meta,dict) else None
 if type(status) is not int or not 100<=status<=599:status='unknown'
 # Classify server message by fixed categories; never output the message.
 message=str(err.get('Message') or '').lower() if isinstance(err,dict) else ''
 groups=(('checksum','checksum'),('content-sha256','checksum'),
         ('authorization','authorization'),('signature','signature'),
         ('account','account'),('region','region'),('jurisdiction','jurisdiction'),
         ('bucket','bucket'),('host','host'),('endpoint','endpoint'),
         ('credential','credential'),('header','header'),('argument','argument'))
 hint=next((label for word,label in groups if word in message),'unspecified')
 return 'code='+code+', HTTP='+str(status)+', hint='+hint

# Diagnostic probes are read-only and non-blocking: a denied LIST must not
# prevent a valid GET/SHA verification from succeeding.
_probe_key=manifest['objects'][0]['key']
try:
 _lst=client.list_objects_v2(Bucket=manifest['bucket'],Prefix=_probe_key,MaxKeys=1)
 print('R2 PROBE LIST: OK; target present='+str(any(
  x.get('Key')==_probe_key for x in _lst.get('Contents',[]))))
except ClientError as exc:
 print('R2 PROBE LIST: FAIL ('+_safe_error(exc)+')',file=sys.stderr)
except Exception as exc:
 print('R2 PROBE LIST: FAIL ('+type(exc).__name__+')',file=sys.stderr)
try:
 _meta=client.head_object(Bucket=manifest['bucket'],Key=_probe_key)
 print('R2 PROBE HEAD: OK; size known='+str(isinstance(_meta.get('ContentLength'),int)))
except ClientError as exc:
 print('R2 PROBE HEAD: FAIL ('+_safe_error(exc)+')',file=sys.stderr)
except Exception as exc:
 print('R2 PROBE HEAD: FAIL ('+type(exc).__name__+')',file=sys.stderr)

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
 except ClientError as exc:
  # Only show allowlisted S3 error codes and numeric HTTP status. Never log
  # response messages, endpoints, signed URLs, request headers or credentials.
  response=exc.response if isinstance(exc.response,dict) else {}
  error=response.get('Error') or {}
  raw_code=str(error.get('Code') or '') if isinstance(error,dict) else ''
  allowed={'AccessDenied','SignatureDoesNotMatch','InvalidAccessKeyId',
           'NoSuchBucket','NoSuchKey','AuthorizationHeaderMalformed',
           'InvalidToken','ExpiredToken','RequestTimeTooSkewed',
           'InvalidRequest','InvalidArgument','PermanentRedirect',
           '401','403','404'}
  code=raw_code if raw_code in allowed else 'Unrecognized'
  meta=response.get('ResponseMetadata') or {}
  http=meta.get('HTTPStatusCode') if isinstance(meta,dict) else None
  if type(http) is not int or not 100<=http<=599:http='unknown'
  errors.append(key+': retrieval failed (ClientError, code='+code+', HTTP='+str(http)+')')
 except Exception as exc:
  # Deliberately do not output str(exc), which may contain an endpoint URL.
  errors.append(key+': retrieval failed ('+type(exc).__name__+')')
for error in errors:print('ERROR:',error,file=sys.stderr)
if errors:sys.exit(1)
print('R2 live verification complete: all',len(manifest['objects']),'objects verified.')
