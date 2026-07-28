/**
 * ============================================================================
 * KWin Plasma 6 C++ TileManager & Tile Core Interface Reference
 * ============================================================================
 * Based on invent.kde.org/plasma/kwin (src/plugins/tiles/)
 *
 * This header reference compiles the exact C++ interface exposed by KWin's
 * Wayland/X11 compositor for Plasma 6 Tiling. In KWin scripts, these objects
 * are manipulated via JavaScript wrappers around `TileManager` and `Tile`.
 */

#pragma once

#include <QObject>
#include <QRectF>
#include <QVector>
#include <QSizeF>

namespace KWin {

class Output;
class Tile;

/**
 * @brief Direction enum for tile splitting operations.
 */
enum class TileSplitDirection {
    Horizontal = 0, // Split side-by-side (Left/Right)
    Vertical = 1    // Split top-bottom (Top/Bottom)
};

/**
 * @brief Represents a node in the KWin Tiling Tree.
 *
 * In Wayland, windows do NOT calculate absolute screen coordinates.
 * Instead, they are assigned to a Tile node (`window.tile = tile`).
 */
class Tile : public QObject
{
    Q_OBJECT
    Q_PROPERTY(KWin::Tile* parentTile READ parentTile CONSTANT)
    Q_PROPERTY(QVector<KWin::Tile*> childTiles READ childTiles NOTIFY childTilesChanged)
    Q_PROPERTY(QRectF relativeGeometry READ relativeGeometry WRITE setRelativeGeometry NOTIFY relativeGeometryChanged)
    Q_PROPERTY(QRectF absoluteGeometry READ absoluteGeometry NOTIFY absoluteGeometryChanged)
    Q_PROPERTY(qreal padding READ padding WRITE setPadding NOTIFY paddingChanged)
    Q_PROPERTY(bool isLayout READ isLayout NOTIFY isLayoutChanged)

public:
    explicit Tile(Tile *parent = nullptr);
    ~Tile() override;

    // Hierarchy accessors
    Tile *parentTile() const;
    QVector<Tile *> childTiles() const;
    bool isLayout() const; // True if this tile has child tiles

    // Geometry & Layout
    QRectF relativeGeometry() const;
    void setRelativeGeometry(const QRectF &rect);
    QRectF absoluteGeometry() const;

    qreal padding() const;
    void setPadding(qreal padding);

    /**
     * @brief Split this tile into two child tiles.
     * @param direction Horizontal or Vertical split.
     */
    Q_INVOKABLE void split(TileSplitDirection direction);

    /**
     * @brief Remove a child tile and reallocate its geometry to siblings.
     */
    Q_INVOKABLE void removeChild(Tile *child);

Q_SIGNALS:
    void childTilesChanged();
    void relativeGeometryChanged();
    void absoluteGeometryChanged();
    void paddingChanged();
    void isLayoutChanged();
};

/**
 * @brief Manages the root tiling tree for a specific screen/output.
 *
 * Accessed in JavaScript via `workspace.tilingForScreen(output)`.
 */
class TileManager : public QObject
{
    Q_OBJECT
    Q_PROPERTY(KWin::Tile* rootTile READ rootTile CONSTANT)
    Q_PROPERTY(KWin::Output* output READ output CONSTANT)

public:
    explicit TileManager(Output *output, QObject *parent = nullptr);
    ~TileManager() override;

    /**
     * @brief Returns the root canvas tile for this output monitor.
     */
    Tile *rootTile() const;

    /**
     * @brief Returns the associated physical screen output.
     */
    Output *output() const;

Q_SIGNALS:
    void tileTreeChanged();
};

} // namespace KWin
