"""QR Code generator using reportlab's built-in QR widget.

Produces pure vector SVG representations of URLs for emergency medical ID cards,
public doctor summary links, and two-factor authentication without external network requests.
"""

from fastapi.responses import Response
from reportlab.graphics import renderSVG
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing


def generate_qr_svg(text: str, size: int = 200) -> str:
    """Generate SVG markup string for a QR code encoding text."""
    drawing = Drawing(size, size)
    qr_widget = qr.QrCodeWidget(text)
    qr_widget.barWidth = size
    qr_widget.barHeight = size
    qr_widget.barBorder = 0
    drawing.add(qr_widget)
    return renderSVG.drawToString(drawing)


def generate_qr_response(text: str, size: int = 200) -> Response:
    """Return an HTTP response serving the QR code SVG with appropriate headers."""
    svg_data = generate_qr_svg(text, size=size)
    return Response(
        content=svg_data,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": "inline; filename=emergency_qr.svg",
        },
    )
