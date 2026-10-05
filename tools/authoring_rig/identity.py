"""Persist IR identities in standard PSD layer IDs and an XMP mapping."""
import json
import xml.etree.ElementTree as ET

from psd_tools.constants import Resource, Tag
from psd_tools.psd.image_resources import ImageResource

NAMESPACE = "urn:live2d-maker:authoring-rig:0.1"


def read_identities(psd):
    xmp = psd.image_resources.get_data(Resource.XMP_METADATA)
    if not xmp:
        return {}
    try:
        node = ET.fromstring(xmp).find(f".//{{{NAMESPACE}}}layerIds")
    except ET.ParseError:
        return {}
    if node is None:
        return {}
    mapping = json.loads(node.text)
    if not isinstance(mapping, dict) or any(not isinstance(v, str) or not v for v in mapping.values()):
        raise ValueError("Invalid IR identity mapping in PSD XMP")
    return mapping


def write_identities(psd, layers):
    # This is a newly built PSD: preserve arbitrary pre-existing IR IDs, including
    # IDs from earlier exporter versions, without embedding them in layer names.
    mapping = {}
    for number, (layer, part) in enumerate(layers, start=1):
        layer.tagged_blocks.set_data(Tag.LAYER_ID, number)
        mapping[str(number)] = part["id"]
    root = ET.Element("{adobe:ns:meta/}xmpmeta")
    rdf = ET.SubElement(root, "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF")
    desc = ET.SubElement(rdf, "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}Description")
    ET.SubElement(desc, f"{{{NAMESPACE}}}layerIds").text = json.dumps(mapping)
    psd.image_resources[Resource.XMP_METADATA] = ImageResource(
        key=Resource.XMP_METADATA, data=ET.tostring(root, encoding="utf-8"))
